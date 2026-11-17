import { useEffect, useState } from 'preact/hooks';
import { Clock, Hoop, Label, Mark, Pill } from '../../src/ui';
import { COMMAND_OVERRIDE, TAB_STATE, type TabState } from '../../src/lib/messages';
import { watchDodged, type Dodged } from '../../src/state/scoreboard';

export interface PopupDeps {
  /** The tab the popup is about: the active tab, or `?tab=<id>` when the popup is opened as a page (tests). */
  tabId(): Promise<number | null>;
  /** Asks the tab's content script. Null when there isn't one (not a Hulu tab). */
  ask(tabId: number, type: string): Promise<TabState | null>;
  watchDodged(onTotals: (dodged: Dodged) => void): () => void;
}

export const browserDeps: PopupDeps = {
  async tabId() {
    const param = Number(new URLSearchParams(location.search).get('tab'));
    if (Number.isInteger(param) && param > 0) return param;
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    return tab?.id ?? null;
  },
  async ask(tabId, type) {
    try {
      const answer = (await browser.tabs.sendMessage(tabId, { type })) as Partial<TabState> | undefined;
      return typeof answer?.inBreak === 'boolean' ? { inBreak: answer.inBreak } : null;
    } catch {
      return null;
    }
  },
  watchDodged,
};

type Tab = { kind: 'loading' } | { kind: 'none' } | { kind: 'hulu'; id: number; inBreak: boolean; note: string | null };

/** The toolbar popup: whether a break is on, "This is an ad" or "This isn't an ad", and the ad time dodged. */
export function Popup({ deps = browserDeps }: { deps?: PopupDeps }) {
  const [tab, setTab] = useState<Tab>({ kind: 'loading' });
  const [dodged, setDodged] = useState<Dodged>({ today: 0, week: 0 });

  useEffect(() => deps.watchDodged(setDodged), [deps]);
  useEffect(() => {
    let live = true;
    (async () => {
      const id = await deps.tabId();
      const state = id === null ? null : await deps.ask(id, TAB_STATE);
      if (!live) return;
      setTab(id !== null && state ? { kind: 'hulu', id, inBreak: state.inBreak, note: null } : { kind: 'none' });
    })().catch(() => live && setTab({ kind: 'none' }));
    return () => {
      live = false;
    };
  }, [deps]);

  async function mark() {
    if (tab.kind !== 'hulu') return;
    const state = await deps.ask(tab.id, COMMAND_OVERRIDE);
    if (!state) return setTab({ kind: 'none' });
    const note = state.inBreak ? 'Marked as an ad. Tab muted.' : 'Marked as not an ad. Sound on.';
    setTab({ kind: 'hulu', id: tab.id, inBreak: state.inBreak, note });
  }

  const inBreak = tab.kind === 'hulu' && tab.inBreak;
  return (
    <main class="popup">
      <header class="pp-head">
        <p class="wordmark">
          <Hoop />
          halftime show
        </p>
      </header>
      {tab.kind === 'none' ? (
        <p class="lede">Halftime Show works on hulu.com.</p>
      ) : (
        <>
          <p class="status" role="status">
            <Mark kind={inBreak ? 'live' : 'solid'} label="" />
            {inBreak ? 'In a break' : 'Watching for ad breaks'}
          </p>
          <div class="pp-actions">
            <Pill variant="outline" class="pp-mark" disabled={tab.kind !== 'hulu'} onClick={mark} aria-keyshortcuts="Alt+Shift+A">
              {inBreak ? "This isn't an ad" : 'This is an ad'}
            </Pill>
          </div>
          {tab.kind === 'hulu' && tab.note && <Label class="pp-note">{tab.note}</Label>}
        </>
      )}
      <section class="pp-score" aria-labelledby="pp-score-h">
        <h2 id="pp-score-h" class="pp-h">
          Ad time dodged
        </h2>
        <dl>
          <div>
            <dt>Today</dt>
            <dd>
              <Clock seconds={dodged.today} />
            </dd>
          </div>
          <div>
            <dt>This week</dt>
            <dd>
              <Clock seconds={dodged.week} />
            </dd>
          </div>
        </dl>
      </section>
      <Label>Not made by or affiliated with Hulu.</Label>
    </main>
  );
}
