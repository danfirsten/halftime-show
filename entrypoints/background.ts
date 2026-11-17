import { muteTab, unmuteTab } from '../src/lib/mute';

// Mutes and unmutes the tab that asked, remembering whether the viewer had muted it already.
export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: { type?: string }, sender) => {
    const tabId = sender.tab?.id;
    if (tabId === undefined) return;
    if (message.type === 'break:start') return muteTab(tabId);
    if (message.type === 'break:end') return unmuteTab(tabId);
  });
});
