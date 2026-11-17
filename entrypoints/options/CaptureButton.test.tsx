// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { CaptureButton, snapshotName, type CaptureDeps } from './CaptureButton';

function mount(deps: CaptureDeps, hash = '#capture') {
  const el = document.createElement('div');
  render(<CaptureButton deps={deps} hash={hash} />, el);
  return el;
}

async function press(el: HTMLElement) {
  el.querySelector('button')!.click();
  await vi.waitFor(() => expect(el.querySelector('[role="status"]')?.textContent).not.toBe('Saving…'));
  await new Promise((r) => setTimeout(r, 0));
}

describe('CaptureButton', () => {
  it('stays hidden without #capture', () => {
    const deps = { findTab: vi.fn(), request: vi.fn(), save: vi.fn() };
    expect(mount(deps, '').innerHTML).toBe('');
  });

  it('asks the most recent player tab for a snapshot and saves it', async () => {
    const deps = { findTab: vi.fn(async () => 7), request: vi.fn(async () => '<!doctype html><body></body>'), save: vi.fn() };
    const el = mount(deps);
    expect(el.querySelector('button')!.textContent).toBe('Save a detection snapshot');
    await press(el);
    await vi.waitFor(() => expect(deps.save).toHaveBeenCalled());
    expect(deps.request).toHaveBeenCalledWith(7);
    expect(deps.save.mock.calls[0]![0]).toBe('<!doctype html><body></body>');
    expect(deps.save.mock.calls[0]![1]).toMatch(/^halftime-snapshot-\d{4}-\d\d-\d\d-\d\d-\d\d-\d\d\.html$/);
    expect(el.querySelector('[role="status"]')!.textContent).toMatch(/^Saved halftime-snapshot-.*to your downloads\.$/);
  });

  it('says what to do when there is no player tab, or it does not answer', async () => {
    const none = mount({ findTab: async () => null, request: vi.fn(), save: vi.fn() });
    await press(none);
    await vi.waitFor(() => expect(none.textContent).toContain('Open an episode on hulu.com in another tab first.'));

    const silent = mount({ findTab: async () => 3, request: async () => Promise.reject(new Error('no receiver')), save: vi.fn() });
    await press(silent);
    await vi.waitFor(() => expect(silent.textContent).toContain('That tab did not answer. Reload it and try again.'));
  });
});

describe('snapshotName', () => {
  it('is dated and safe as a file name', () => {
    expect(snapshotName(new Date('2026-11-17T09:05:03Z'))).toBe('halftime-snapshot-2026-11-17-09-05-03.html');
  });
});
