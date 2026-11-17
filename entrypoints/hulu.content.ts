import type { Browser } from 'wxt/browser';
import { answerHuluCapture, detectHulu } from '../src/detect';
import { hulu } from '../src/sites/hulu';
import { mountOverlay, type OverlayHandle } from '../src/overlay';
import { shows } from '../src/shows';
import { createBreakControl } from '../src/lib/break-control';
import { createPageMuter } from '../src/lib/mute';
import { BREAK_END, BREAK_START, COMMAND_OVERRIDE, PING, PORT_NAME, TAB_STATE, messageType, type BreakEndMessage, type MuteReply, type TabState } from '../src/lib/messages';
import { watchDodged, type Dodged } from '../src/state/scoreboard';
import { createWatchClock, recordBreakSeen, recordWatched } from '../src/state/detection';
import { presetShow, readSettings, saveLastShow, watchSettings, type Settings } from '../src/state/settings';

const PING_MS = 20_000;
const UPDATE_MS = 250;
const RECONNECT_MS = 200;
const WATCH_TICK_MS = 30_000;

// On Hulu (and the stand-in player in dev builds): the detector says when a break starts and ends, the background
// mutes and unmutes the tab, and the overlay covers the ad in between. Sound first, then the picture, both ways.
export default defineContentScript({
  matches: ['*://*.hulu.com/*'],
  main(ctx) {
    document.documentElement.dataset.halftimeShow = 'ready';
    const stopCapture = answerHuluCapture(document);

    let settings: Settings = readSettings(undefined);
    // The overlay is built with the show to count down to, so a changed setting means a new one at the next break.
    let overlayStale = false;
    let dodged: Dodged = { today: 0, week: 0 };
    let overlay: OverlayHandle | null = null;
    let overlayVideo: HTMLElement | null = null;
    let updates: ReturnType<typeof setInterval> | undefined;
    let pings: ReturnType<typeof setInterval> | undefined;
    let port: Browser.runtime.Port | null = null;

    // Settings reach this tab as soon as they change: switching the site off ends a break that is on.
    const stopSettings = watchSettings((next) => {
      settings = next;
      overlayStale = true;
      if (!next.enabled.hulu && control.inBreak()) control.detected({ type: 'break:end', secondsLeft: null });
    });
    const stopDodged = watchDodged((d) => {
      dodged = d;
      overlay?.setDodged(d);
    });

    function findVideo(): HTMLElement | null {
      for (const selector of hulu.videoSelectors) {
        const video = document.querySelector<HTMLElement>(selector);
        if (video) return video;
      }
      return null;
    }

    // The overlay is mounted at the first break, and again if the player swapped its video since.
    function overlayFor(video: HTMLElement): OverlayHandle {
      if (overlay && overlayVideo === video && overlay.host.isConnected && !overlayStale) return overlay;
      overlayStale = false;
      overlay?.destroy();
      overlayVideo = video;
      overlay = mountOverlay(video, {
        shows,
        lastShow: presetShow(settings),
        dodged,
        onPick(id) {
          saveLastShow(id).catch(() => undefined);
        },
        onNotAd: () => control.notAd(),
      });
      return overlay;
    }

    async function send<T>(message: object): Promise<T> {
      return (await browser.runtime.sendMessage(message)) as T;
    }

    // Where the browser can't mute the tab (Safari), the background says so and the page's video is muted instead.
    const pageMute = createPageMuter(document);
    const control = createBreakControl({
      async mute() {
        const reply = await send<MuteReply | undefined>({ type: BREAK_START });
        if (reply?.mutePage) pageMute.start();
      },
      async unmute(notAd) {
        const page = pageMute.end();
        const reply = await send<MuteReply | undefined>({ type: BREAK_END, notAd } satisfies BreakEndMessage).catch(() => undefined);
        return page ?? reply?.muted === true;
      },
      open(seconds) {
        const video = findVideo();
        if (!video) return;
        overlayFor(video).open(seconds);
        clearInterval(updates);
        updates = setInterval(() => overlay?.update(detector.verdict().secondsLeft), UPDATE_MS);
        if (!port) connect();
        clearInterval(pings);
        pings = setInterval(() => port?.postMessage({ type: PING }), PING_MS);
      },
      close(how) {
        clearInterval(updates);
        clearInterval(pings);
        overlay?.close(how);
      },
    });

    const detector = detectHulu(document, (event) => {
      if (!settings.enabled.hulu) return;
      if (event.type === 'break:start') recordBreakSeen().catch(() => undefined);
      control.detected(event);
    });

    // Time spent watching with no break spotted, for the "detection may be out of date" note.
    const watchClock = createWatchClock(Date.now, (seconds) => void recordWatched(seconds).catch(() => undefined));
    const watching = setInterval(() => {
      const video = settings.enabled.hulu && !control.inBreak() ? findVideo() : null;
      const player = video instanceof HTMLVideoElement ? video : video?.querySelector('video');
      watchClock.tick(player instanceof HTMLVideoElement && !player.paused && !player.ended);
    }, WATCH_TICK_MS);

    // The port tells the background this page is alive. If it drops mid break (the worker restarted), connect again
    // and say so again so the tab stays muted. Outside a break it waits for the next one, so an idle tab never keeps
    // waking the worker.
    function connect() {
      if (ctx.isInvalid) return;
      try {
        port = browser.runtime.connect({ name: PORT_NAME });
      } catch {
        return;
      }
      const mine = port;
      mine.onDisconnect.addListener(() => {
        if (port !== mine) return;
        port = null;
        if (!control.inBreak()) return;
        ctx.setTimeout(() => {
          if (port || !control.inBreak()) return;
          connect();
          send({ type: BREAK_START }).catch(() => undefined);
        }, RECONNECT_MS);
      });
    }
    connect();

    const onMessage = (message: unknown) => {
      const type = messageType(message);
      if (type === COMMAND_OVERRIDE) {
        if (settings.enabled.hulu) control.toggle();
        return Promise.resolve<TabState>({ inBreak: control.inBreak() });
      }
      if (type === TAB_STATE) return Promise.resolve<TabState>({ inBreak: control.inBreak() });
      return undefined;
    };
    browser.runtime.onMessage.addListener(onMessage);

    ctx.onInvalidated(() => {
      detector.stop();
      stopCapture();
      stopDodged();
      stopSettings();
      clearInterval(watching);
      browser.runtime.onMessage.removeListener(onMessage);
      clearInterval(updates);
      clearInterval(pings);
      pageMute.end();
      overlay?.destroy();
      port = null;
    });
  },
});
