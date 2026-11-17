// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { Options, type OptionsDeps } from './Options';
import { loadSettings } from '../../src/state/settings';
import { DETECTION_KEY, STALE_AFTER_SECONDS } from '../../src/state/detection';

function deps(over: Partial<OptionsDeps> = {}): OptionsDeps {
  return { watchDodged: (on) => (on({ today: 870, week: 6730 }), () => undefined), resetDodged: async () => undefined, shortcut: async () => 'Alt+Shift+A', firefox: false, ...over };
}

async function mount(d: OptionsDeps) {
  const el = document.createElement('div');
  document.body.append(el);
  render(<Options deps={d} />, el);
  await vi.waitFor(() => expect(el.querySelector('kbd')).not.toBeNull());
  return el;
}

describe('Options', () => {
  beforeEach(() => fakeBrowser.reset());

  it('switches hulu.com off and on, and saves it', async () => {
    const el = await mount(deps());
    const sw = el.querySelector<HTMLButtonElement>('.sw')!;
    expect(sw.getAttribute('aria-checked')).toBe('true');
    sw.click();
    await vi.waitFor(async () => expect((await loadSettings()).enabled.hulu).toBe(false));
    expect(el.querySelector('.sw')?.getAttribute('aria-checked')).toBe('false');
    expect(el.querySelector('.sw')?.textContent).toBe('Off');
  });

  it('picks the default show, and "Ask each break" clears it', async () => {
    const el = await mount(deps());
    el.querySelector<HTMLButtonElement>('[data-show="catch"]')!.click();
    await vi.waitFor(async () => expect((await loadSettings()).defaultShow).toBe('catch'));
    expect(el.querySelector('[data-show="catch"]')?.getAttribute('aria-checked')).toBe('true');
    el.querySelector<HTMLButtonElement>('[data-show="ask"]')!.click();
    await vi.waitFor(async () => expect((await loadSettings()).defaultShow).toBeNull());
  });

  it('follows a change made somewhere else', async () => {
    const el = await mount(deps());
    await fakeBrowser.storage.local.set({ settings: { enabled: { hulu: false }, defaultShow: 'look' } });
    await vi.waitFor(() => expect(el.querySelector('.sw')?.getAttribute('aria-checked')).toBe('false'));
    expect(el.querySelector('[data-show="look"]')?.getAttribute('aria-checked')).toBe('true');
  });

  it('shows the scoreboard and asks before resetting it', async () => {
    const reset = vi.fn(async () => undefined);
    const el = await mount(deps({ resetDodged: reset }));
    await vi.waitFor(() => expect(el.textContent).toContain('14:30'));
    el.querySelector<HTMLButtonElement>('.op-reset')!.click();
    await vi.waitFor(() => expect(el.textContent).toContain('Reset ad time dodged for today and this week? High scores stay.'));
    expect(reset).not.toHaveBeenCalled();
    el.querySelector<HTMLButtonElement>('.op-confirm')!.click();
    await vi.waitFor(() => expect(reset).toHaveBeenCalledOnce());
  });

  it('lists the shortcut the browser has and says where to change it', async () => {
    const el = await mount(deps({ shortcut: async () => 'Ctrl+Shift+Y' }));
    await vi.waitFor(() => expect(el.querySelector('kbd')?.textContent).toBe('Ctrl+Shift+Y'));
    expect(el.textContent).toContain('chrome://extensions/shortcuts');
    const ff = await mount(deps({ firefox: true }));
    expect(ff.textContent).toContain('Manage Extension Shortcuts');
  });

  it('explains the three permissions and credits the word list and the trivia', async () => {
    const text = (await mount(deps())).textContent!;
    for (const needle of ['collects nothing and makes no network calls', 'Tabs', 'Storage', 'Access to hulu.com', 'Open Trivia Database', 'CC BY-SA 4.0', 'SCOWL', 'not made by or affiliated with Hulu']) expect(text).toContain(needle);
  });

  it('links the full licence texts that ship inside the extension', async () => {
    const el = await mount(deps());
    const links = [...el.querySelectorAll<HTMLAnchorElement>('a[href^="licences/"]')].map((a) => a.getAttribute('href'));
    expect(links).toEqual(['licences/SCOWL-COPYRIGHT.txt', 'licences/QUESTIONS-LICENSE.txt', 'licences/Geist-OFL.txt', 'licences/GeistMono-OFL.txt', 'licences/LICENSE.txt']);
  });

  it('says detection may be out of date only after a long watch with no break', async () => {
    const quiet = await mount(deps());
    expect(quiet.querySelector('.stale')).toBeNull();
    await fakeBrowser.storage.local.set({ [DETECTION_KEY]: { watched: STALE_AFTER_SECONDS } });
    await vi.waitFor(() => expect(quiet.querySelector('.stale')?.textContent).toContain('Detection may be out of date'));
  });
});
