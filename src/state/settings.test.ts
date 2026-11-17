import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { SETTINGS_KEY, loadSettings, presetShow, readSettings, saveLastShow, saveSettings, watchSettings } from './settings';

const stored = async () => (await fakeBrowser.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY];

describe('settings', () => {
  beforeEach(() => fakeBrowser.reset());

  it('starts on for hulu.com, asking each break, with no last show', async () => {
    expect(await loadSettings()).toEqual({ lastShow: null, enabled: { hulu: true }, defaultShow: null });
    expect(readSettings({ lastShow: 'bowling', defaultShow: 7, enabled: { hulu: 'no' } })).toEqual({ lastShow: null, enabled: { hulu: true }, defaultShow: null });
  });

  it('saves the last show and keeps other settings', async () => {
    await fakeBrowser.storage.local.set({ [SETTINGS_KEY]: { enabled: { hulu: false }, defaultShow: 'look' } });
    await saveLastShow('trivia');
    expect(await loadSettings()).toEqual({ lastShow: 'trivia', enabled: { hulu: false }, defaultShow: 'look' });
  });

  it('switches a site off and on, and picks and clears the default show', async () => {
    await saveSettings({ enabled: { hulu: false } });
    expect((await loadSettings()).enabled.hulu).toBe(false);
    await saveSettings({ enabled: { hulu: true }, defaultShow: 'catch' });
    expect(await loadSettings()).toMatchObject({ enabled: { hulu: true }, defaultShow: 'catch' });
    await saveSettings({ defaultShow: null });
    expect((await loadSettings()).defaultShow).toBeNull();
    expect(Object.keys((await stored()) as object).sort()).toEqual(['defaultShow', 'enabled']);
  });

  it('writes made together all land', async () => {
    await Promise.all([saveSettings({ defaultShow: 'words' }), saveLastShow('look'), saveSettings({ enabled: { hulu: false } })]);
    expect(await loadSettings()).toEqual({ lastShow: 'look', enabled: { hulu: false }, defaultShow: 'words' });
  });

  it('counts down to the default show when there is one, else the last show used', () => {
    expect(presetShow({ lastShow: 'trivia', defaultShow: null })).toBe('trivia');
    expect(presetShow({ lastShow: 'trivia', defaultShow: 'look' })).toBe('look');
    expect(presetShow({ lastShow: null, defaultShow: null })).toBeNull();
  });

  it('tells a watcher at once when settings change, and stops when asked', async () => {
    const seen: boolean[] = [];
    const stop = watchSettings((s) => seen.push(s.enabled.hulu));
    await saveSettings({ enabled: { hulu: false } });
    await saveSettings({ enabled: { hulu: true } });
    stop();
    await saveSettings({ enabled: { hulu: false } });
    expect(seen.at(-1)).toBe(true);
    expect(seen).toContain(false);
    expect(seen.length).toBeLessThanOrEqual(3);
  });
});
