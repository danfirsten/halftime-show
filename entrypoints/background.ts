import type { Browser } from 'wxt/browser';
import { forgetTab, muteTab, unmuteTab } from '../src/lib/mute';
import { createBreakKeeper } from '../src/lib/break-keeper';
import { sessionRecord } from '../src/lib/session-record';
import { BREAK_END, BREAK_START, COMMAND_OVERRIDE, OVERRIDE_COMMAND, PORT_NAME, messageType, type MuteReply } from '../src/lib/messages';
import { recordDodged } from '../src/state/scoreboard';

// Mutes and unmutes the Hulu tab for each break, keeps the ad time dodged, and owns the Alt+Shift+A command.
// Each Hulu tab's content script holds a port open: if it closes mid-break (the page reloaded, navigated or
// crashed), the tab gets its sound back.
export default defineBackground(() => {
  const keeper = createBreakKeeper({
    mute: muteTab,
    unmute: unmuteTab,
    starts: sessionRecord<number>('breakStarts', (v): v is number => typeof v === 'number' && Number.isFinite(v)),
    record: (seconds) => recordDodged(seconds),
    now: () => Date.now(),
  });
  const ports = new Map<number, Browser.runtime.Port>();
  const quietly = (step: Promise<unknown>) => void step.catch(() => undefined);

  browser.runtime.onMessage.addListener((message: unknown, sender) => {
    const tabId = sender.tab?.id;
    if (tabId === undefined) return undefined;
    const type = messageType(message);
    if (type === BREAK_START) return keeper.start(tabId).then((muted): MuteReply => ({ muted }));
    if (type === BREAK_END) {
      const notAd = (message as { notAd?: unknown }).notAd === true;
      return keeper.end(tabId, { notAd }).then((muted): MuteReply => ({ muted }));
    }
    return undefined;
  });

  browser.runtime.onConnect.addListener((port) => {
    const tabId = port.sender?.tab?.id;
    if (port.name !== PORT_NAME || tabId === undefined) return;
    ports.set(tabId, port);
    // Pings during a break only keep this worker awake; there is nothing to answer.
    port.onMessage.addListener(() => undefined);
    port.onDisconnect.addListener(() => {
      if (ports.get(tabId) === port) ports.delete(tabId);
      quietly(keeper.end(tabId));
    });
  });

  // The tab moved to another address with no content script left to say so: end its break.
  browser.tabs.onUpdated.addListener((tabId, change) => {
    if (change.url !== undefined && !ports.has(tabId)) quietly(keeper.end(tabId));
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    ports.delete(tabId);
    quietly(keeper.end(tabId).finally(() => forgetTab(tabId)));
  });

  browser.commands.onCommand.addListener((command, tab) => {
    if (command !== OVERRIDE_COMMAND) return;
    quietly(
      (async () => {
        const id = tab?.id ?? (await browser.tabs.query({ active: true, currentWindow: true }))[0]?.id;
        if (id !== undefined) await browser.tabs.sendMessage(id, { type: COMMAND_OVERRIDE });
      })(),
    );
  });
});
