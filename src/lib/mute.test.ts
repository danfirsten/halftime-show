import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

// The tab mute adapter, against a fake tabs API: it remembers the viewer's own mute across a stopped worker
// (storage.session), and never unmutes a tab that has no break on.
const tabs = new Map<number, boolean>();

async function freshMute() {
  vi.resetModules();
  return import('./mute');
}

beforeEach(() => {
  fakeBrowser.reset();
  tabs.clear();
  vi.spyOn(browser.tabs, 'get').mockImplementation((async (id: number) => ({ id, mutedInfo: { muted: tabs.get(id) ?? false } })) as never);
  vi.spyOn(browser.tabs, 'update').mockImplementation((async (id: number, props: { muted?: boolean }) => {
    tabs.set(id, props.muted ?? false);
    return { id };
  }) as never);
});

describe('mute', () => {
  it('mutes for a break and unmutes after', async () => {
    const { muteTab, unmuteTab } = await freshMute();
    expect(await muteTab(1)).toBe(true);
    expect(tabs.get(1)).toBe(true);
    expect(await unmuteTab(1)).toBe(false);
    expect(tabs.get(1)).toBe(false);
  });

  it('leaves a tab the viewer muted muted, even if the worker restarted mid break', async () => {
    tabs.set(2, true);
    const first = await freshMute();
    expect(await first.muteTab(2)).toBe(true);
    const restarted = await freshMute();
    expect(await restarted.unmuteTab(2)).toBe(true);
    expect(tabs.get(2)).toBe(true);
  });

  it('remembers a break across a restart, so the sound still comes back', async () => {
    const first = await freshMute();
    await first.muteTab(3);
    const restarted = await freshMute();
    expect(await restarted.unmuteTab(3)).toBe(false);
    expect(tabs.get(3)).toBe(false);
  });

  it('does nothing to a tab with no break on', async () => {
    tabs.set(4, true);
    const { unmuteTab } = await freshMute();
    expect(await unmuteTab(4)).toBe(true);
    expect(tabs.get(4)).toBe(true);
  });
});

describe('mute where the browser has no tab mute (Safari)', () => {
  beforeEach(() => {
    vi.spyOn(browser.tabs, 'get').mockImplementation((async (id: number) => ({ id })) as never);
  });

  it('says so, and leaves the tab alone at both ends of a break', async () => {
    const { canMuteTab, muteTab, unmuteTab } = await freshMute();
    expect(await canMuteTab(5)).toBe(false);
    expect(await muteTab(5)).toBe(false);
    expect(await unmuteTab(5)).toBe(false);
    expect(browser.tabs.update).not.toHaveBeenCalled();
  });
});

describe('canMuteTab', () => {
  it('is true where the browser reports the tab mute', async () => {
    const { canMuteTab } = await freshMute();
    expect(await canMuteTab(6)).toBe(true);
  });
});
