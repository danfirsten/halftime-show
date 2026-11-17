import { useState } from 'preact/hooks';
import { Label, Pill } from '../../src/ui';
import { CAPTURE_MESSAGE } from '../../src/detect/capture';

// A hidden tool for fixing detection: open the options page with #capture on the end of its address, with an
// episode open in another tab, and this saves a copy of that player's page (scripts and personal text removed).

const PLAYER_TABS = ['*://*.hulu.com/*', '*://localhost/fixture/*'];

export interface CaptureDeps {
  findTab(): Promise<number | null>;
  /** The snapshot; '' when the tab has no player on it (an account page, say); null when it doesn't answer. */
  request(tabId: number): Promise<string | null>;
  save(html: string, name: string): void;
}

export const browserDeps: CaptureDeps = {
  async findTab() {
    const tabs = await browser.tabs.query({ url: PLAYER_TABS });
    tabs.sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));
    return tabs[0]?.id ?? null;
  },
  async request(tabId) {
    const answer = (await browser.tabs.sendMessage(tabId, { type: CAPTURE_MESSAGE })) as { html?: unknown } | undefined;
    if (answer?.html === null) return '';
    return typeof answer?.html === 'string' ? answer.html : null;
  },
  save(html, name) {
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};

type Status = { kind: 'idle' } | { kind: 'busy' } | { kind: 'saved'; name: string } | { kind: 'error'; text: string };

export function snapshotName(when: Date): string {
  return `halftime-snapshot-${when.toISOString().slice(0, 19).replace(/[T:]/g, '-')}.html`;
}

export function CaptureButton({ deps = browserDeps, hash = location.hash }: { deps?: CaptureDeps; hash?: string }) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  if (hash !== '#capture') return null;

  async function capture() {
    setStatus({ kind: 'busy' });
    try {
      const tabId = await deps.findTab();
      if (tabId === null) return setStatus({ kind: 'error', text: 'Open an episode on hulu.com in another tab first.' });
      const html = await deps.request(tabId).catch(() => null);
      if (html === null) return setStatus({ kind: 'error', text: 'That tab did not answer. Reload it and try again.' });
      if (html === '') return setStatus({ kind: 'error', text: 'There is no player in your most recent Hulu tab. Start an episode there and try again.' });
      const name = snapshotName(new Date());
      deps.save(html, name);
      setStatus({ kind: 'saved', name });
    } catch {
      setStatus({ kind: 'error', text: 'Something went wrong. Try again.' });
    }
  }

  return (
    <section class="op-sec" aria-labelledby="op-capture">
      <h2 id="op-capture" class="op-h">Detection snapshot</h2>
      <p class="op-p">
        Saves a copy of the player in your most recent Hulu tab, so detection can be fixed against a real page. Scripts,
        links and images are taken out, and so is all text but the player's own, such as "Ad" and the countdown. Best
        taken during an ad.
      </p>
      <div class="op-row">
        <Pill variant="outline" onClick={capture} disabled={status.kind === 'busy'}>
          Save a detection snapshot
        </Pill>
      </div>
      <p role="status" class="op-p">
        {status.kind === 'busy' && <Label>Saving…</Label>}
        {status.kind === 'saved' && <Label>Saved {status.name} to your downloads.</Label>}
        {status.kind === 'error' && <Label>{status.text}</Label>}
      </p>
    </section>
  );
}
