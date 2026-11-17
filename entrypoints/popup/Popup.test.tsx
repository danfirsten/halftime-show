// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { Popup, type PopupDeps } from './Popup';
import { COMMAND_OVERRIDE, TAB_STATE } from '../../src/lib/messages';

function fakeDeps(opts: { tab?: number | null; inBreak?: boolean | null } = {}) {
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
      on({ today: 870, week: 6730 });
      return () => undefined;
    },
  };
  return { deps, asked };
}

async function mount(deps: PopupDeps) {
  const el = document.createElement('div');
  render(<Popup deps={deps} />, el);
  await vi.waitFor(() => expect(el.querySelector('.pp-mark:not([disabled]), .lede')).not.toBeNull());
  return el;
}

describe('Popup', () => {
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
});
