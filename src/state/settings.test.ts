import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { SETTINGS_KEY, loadSettings, readSettings, saveLastShow } from './settings';

describe('settings', () => {
  beforeEach(() => fakeBrowser.reset());

  it('has no last show before the first pick', async () => {
    expect(await loadSettings()).toEqual({ lastShow: null });
    expect(readSettings({ lastShow: 'bowling' })).toEqual({ lastShow: null });
  });

  it('saves the last show and keeps other settings', async () => {
    await fakeBrowser.storage.local.set({ [SETTINGS_KEY]: { enabled: { hulu: false } } });
    await saveLastShow('trivia');
    expect(await loadSettings()).toEqual({ lastShow: 'trivia' });
    expect((await fakeBrowser.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY]).toEqual({ enabled: { hulu: false }, lastShow: 'trivia' });
  });
});
