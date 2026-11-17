// Development and tests only (release builds leave this page out, see wxt.config.ts). Loads the stand-in player from
// fixture/ and drives the overlay from the player's own ad markup, the way #wire will drive it from the detector.
// Same query params as the player (fixture/README.md), for example /overlay-stage.html?breaks=2:30.
import { mountOverlay, type OverlayHandle } from '../../src/overlay';
import type { ShowId } from '../../src/shows/types';

declare global {
  interface Window {
    fixtureState?: { inBreak: boolean; markersVisible: boolean; elapsed: number; src: string };
    halftimeStage?: { overlay: OverlayHandle; picks: ShowId[]; notAd: number };
  }
}

function seconds(text: string | null | undefined): number | null {
  const m = /^(\d+):(\d\d)$/.exec((text ?? '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

async function loadPlayer() {
  const html = await (await fetch('/fixture/player.html')).text();
  const page = new DOMParser().parseFromString(html, 'text/html');
  // The player names its clips relative to fixture/, and swaps them later from player.js.
  const base = document.createElement('base');
  base.href = '/fixture/';
  document.head.prepend(base);
  document.head.append(...page.head.querySelectorAll('style'));
  for (const node of [...page.body.childNodes]) if (!(node instanceof HTMLScriptElement)) document.body.append(node);
  const script = document.createElement('script');
  script.src = '/fixture/player.js';
  await new Promise((done) => {
    script.onload = done;
    document.body.append(script);
  });
}

await loadPlayer();
const video = document.querySelector<HTMLVideoElement>('[data-fixture="video"]')!;
const params = new URLSearchParams(location.search);
const picks: ShowId[] = [];
const stage = { picks, notAd: 0 } as unknown as NonNullable<Window['halftimeStage']>;
let dismissed = false;
const overlay = mountOverlay(video, {
  lastShow: (params.get('last') as ShowId | null) ?? undefined,
  dodged: { today: 870, week: 6730 },
  onPick: (id) => picks.push(id),
  onNotAd: () => {
    stage.notAd++;
    dismissed = true;
    overlay.close({ notAd: true });
  },
});
stage.overlay = overlay;
// Stage only: Chromium's document.getAnimations() leaves out shadow roots, so QA's frame strips would see no motion.
// Hand it the overlay's animations too. The overlay itself is unchanged.
const pageAnimations = document.getAnimations.bind(document);
document.getAnimations = () => [...pageAnimations(), ...(overlay.host.shadowRoot?.getAnimations() ?? [])];
window.halftimeStage = stage;

function tick() {
  const state = window.fixtureState;
  if (!state) return;
  if (!state.inBreak) {
    dismissed = false;
    overlay.close();
    return;
  }
  if (dismissed) return;
  const countdown = document.querySelector<HTMLElement>('[data-fixture="ad-countdown"]');
  const left = countdown && !countdown.hidden ? seconds(countdown.textContent) : null;
  overlay.open(left);
  overlay.update(left);
}
// The player's "End the break" closes at once, so a recording of the close starts on the click.
document.getElementById('btn-end')?.addEventListener('click', () => overlay.close(), true);
// ?back=1: a break that has just ended, so QA photographs the back note on every run.
if (params.get('back') === '1') {
  overlay.open(42);
  overlay.close();
} else {
  tick();
  setInterval(tick, 250);
}
