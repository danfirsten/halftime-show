// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { loadSettings } from '../../src/state/settings';
import { DETECTION_KEY, STALE_AFTER_SECONDS } from '../../src/state/detection';
import { render } from 'preact';
import { Popup, type PopupDeps } from './Popup';
import { COMMAND_OVERRIDE, TAB_STATE } from '../../src/lib/messages';

function fakeDeps(opts: { tab?: number | null; inBreak?: boolean | null; dodged?: { today: number; week: number } } = {}) {
  let inBreak = opts.inBreak ?? false;
  const asked: string[] = [];
  const deps: PopupDeps = {
    tabId: async () => (opts.tab === undefined ? 7 : opts.tab),
    async ask(_id, type) {
      asked.push(type);
      if (opts.inBreak === null) return null;
      if (type === COMMAND_OVERRIDE) inBreak = !inBreak;
      return { inBreak };
    },
    watchDodged(on) {
      on(opts.dodged ?? { today: 870, week: 6730 });
      return () => undefined;
    },
    openOptions: () => void asked.push('options'),
  };
  return { deps, asked };
}

async function mount(deps: PopupDeps) {
  const el = document.createElement('div');
  render(<Popup deps={deps} />, el);
  await vi.waitFor(() => expect(el.querySelector('.pp-mark:not([disabled]), .sw, .lede')).not.toBeNull());
  return el;
}

describe('Popup', () => {
  beforeEach(() => fakeBrowser.reset());

  it('shows ad time dodged today and this week', async () => {
    const el = await mount(fakeDeps().deps);
    expect(el.querySelector('.pp-score')?.textContent).toContain('Today14:30');
    expect(el.querySelector('.pp-score')?.textContent).toContain('This week1:52:10');
  });

  it('"This is an ad" marks a break, then reads "This isn\'t an ad"', async () => {
    const { deps, asked } = fakeDeps();
    const el = await mount(deps);
    const button = el.querySelector<HTMLButtonElement>('.pp-mark')!;
    expect(button.textContent).toBe('This is an ad');
    button.click();
    await vi.waitFor(() => expect(button.textContent).toBe("This isn't an ad"));
    expect(el.textContent).toContain('Marked as an ad. Tab muted.');
    expect(el.querySelector('.status')?.textContent).toBe('In a break');
    button.click();
    await vi.waitFor(() => expect(button.textContent).toBe('This is an ad'));
    expect(el.textContent).toContain('Marked as not an ad. Sound on.');
    expect(asked).toEqual([TAB_STATE, COMMAND_OVERRIDE, COMMAND_OVERRIDE]);
  });

  it('reads "This isn\'t an ad" when opened during a break', async () => {
    const el = await mount(fakeDeps({ inBreak: true }).deps);
    expect(el.querySelector('.pp-mark')?.textContent).toBe("This isn't an ad");
  });

  it('says where it works on a tab with no Hulu player', async () => {
    const el = await mount(fakeDeps({ inBreak: null }).deps);
    expect(el.querySelector('.lede')?.textContent).toBe('Halftime Show works on hulu.com.');
    expect(el.querySelector('.pp-mark')).toBeNull();
    expect(el.querySelector('.pp-score')).not.toBeNull();
  });

  it('switches the site off: the status says so, the button goes, and it is saved', async () => {
    const el = await mount(fakeDeps().deps);
    expect(el.querySelector('.status')?.textContent).toBe('Watching for ad breaks');
    el.querySelector<HTMLButtonElement>('.sw')!.click();
    await vi.waitFor(() => expect(el.querySelector('.status')?.textContent).toBe('Off on hulu.com'));
    expect(el.querySelector('.pp-mark')).toBeNull();
    expect(el.querySelector('.status [data-mark]')?.getAttribute('data-mark')).toBe('dotted');
    await vi.waitFor(async () => expect((await loadSettings()).enabled.hulu).toBe(false));
  });

  it('does not claim a break once the site is off', async () => {
    await fakeBrowser.storage.local.set({ settings: { enabled: { hulu: false } } });
    const el = await mount(fakeDeps({ inBreak: true }).deps);
    await vi.waitFor(() => expect(el.querySelector('.status')?.textContent).toBe('Off on hulu.com'));
  });

  it('picks the default show and goes to options', async () => {
    const { deps, asked } = fakeDeps();
    const el = await mount(deps);
    el.querySelector<HTMLButtonElement>('.pp-show [data-show="look"]')!.click();
    await vi.waitFor(async () => expect((await loadSettings()).defaultShow).toBe('look'));
    el.querySelector<HTMLAnchorElement>('.pp-options')!.click();
    expect(asked).toContain('options');
  });

  it('says what will appear before the first break, and warns when detection looks out of date', async () => {
    const el = await mount(fakeDeps({ dodged: { today: 0, week: 0 } }).deps);
    expect(el.querySelector('.pp-empty')?.textContent).toContain('No ad breaks yet.');
    expect(el.querySelector('.stale')).toBeNull();
    await fakeBrowser.storage.local.set({ [DETECTION_KEY]: { watched: STALE_AFTER_SECONDS } });
    await vi.waitFor(() => expect(el.querySelector('.stale')?.textContent).toContain('Detection may be out of date'));
  });
});
