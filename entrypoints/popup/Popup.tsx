import { useEffect, useRef, useState } from 'preact/hooks';
import { Clock, Hoop, Label, Mark, Pill } from '../../src/ui';
import { COMMAND_OVERRIDE, TAB_STATE, type TabState } from '../../src/lib/messages';
import { watchDodged, type Dodged } from '../../src/state/scoreboard';
import { SITE_HOSTS } from '../../src/state/settings';
import { isStale } from '../../src/state/detection';
import { ShowChoice } from '../../src/settings/ShowChoice';
import { SiteSwitch } from '../../src/settings/SiteSwitch';
import { StaleNote } from '../../src/settings/StaleNote';
import { useDetection, useSettings } from '../../src/settings/useSettings';

export interface PopupDeps {
  /** The tab the popup is about: the active tab, or `?tab=<id>` when the popup is opened as a page (tests). */
  tabId(): Promise<number | null>;
  /** Asks the tab's content script. Null when there isn't one (not a Hulu tab). */
  ask(tabId: number, type: string): Promise<TabState | null>;
  watchDodged(onTotals: (dodged: Dodged) => void): () => void;
  openOptions(): void;
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
  watchDodged(onTotals) {
    // Outside the extension (the QA shooter serves this page over http) there is no storage: show 0:00.
    try {
      return watchDodged(onTotals);
    } catch {
      return () => undefined;
    }
  },
  openOptions() {
    try {
      void browser.runtime.openOptionsPage();
    } catch {
      window.open('options.html', '_blank');
    }
  },
};

type Tab = { kind: 'loading' } | { kind: 'none' } | { kind: 'hulu'; id: number; inBreak: boolean; note: string | null };

const HOST = SITE_HOSTS.hulu;

/** The toolbar popup: on or off for this site, whether a break is on, "This is an ad" or "This isn't an ad", the ad time dodged and the default show. */
export function Popup({ deps = browserDeps }: { deps?: PopupDeps }) {
  const [tab, setTab] = useState<Tab>({ kind: 'loading' });
  const [dodged, setDodged] = useState<Dodged>({ today: 0, week: 0 });
  const { settings, change, saveFailed } = useSettings();
  const detection = useDetection();

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

  const on = settings.enabled.hulu;
  // Switching the site off or on, here or on the options page, ends any break in the tab: don't show an old one.
  const wasOn = useRef(on);
  useEffect(() => {
    if (wasOn.current === on) return;
    wasOn.current = on;
    setTab((t) => (t.kind === 'hulu' ? { ...t, inBreak: false, note: null } : t));
  }, [on]);
  const onHulu = tab.kind === 'hulu';
  // Switching the site off ends a break in the tab, so the popup stops claiming one is on.
  const inBreak = onHulu && on && tab.inBreak;
  return (
    <main class="popup">
      <header class="pp-head">
        <p class="wordmark">
          <Hoop />
          halftime show
        </p>
        {onHulu && <SiteSwitch site={HOST} on={on} onChange={(next) => change({ enabled: { hulu: next } })} />}
      </header>
      {tab.kind === 'none' ? (
        <p class="lede">Halftime Show works on {HOST}.</p>
      ) : (
        <>
          <p class="status" role="status">
            {!on ? <Mark kind="dotted" label="" /> : <Mark kind={inBreak ? 'live' : 'solid'} label="" />}
            {!on ? `Off on ${HOST}` : inBreak ? 'In a break' : 'Watching for ad breaks'}
          </p>
          {on && (
            <div class="pp-actions">
              <Pill variant="outline" class="pp-mark" disabled={!onHulu} onClick={mark} aria-keyshortcuts="Alt+Shift+A">
                {inBreak ? "This isn't an ad" : 'This is an ad'}
              </Pill>
            </div>
          )}
          {onHulu && on && tab.note && <Label class="pp-note">{tab.note}</Label>}
        </>
      )}
      {on && isStale(detection) && <StaleNote />}
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
        {dodged.week === 0 && <p class="pp-empty">No ad breaks yet. Start an episode and the first one opens here.</p>}
      </section>
      <section class="pp-show" aria-labelledby="pp-show-h">
        <h2 id="pp-show-h" class="pp-h">
          Halftime show
        </h2>
        <ShowChoice label="Default halftime show" value={settings.defaultShow} onChange={(defaultShow) => change({ defaultShow })} />
      </section>
      {saveFailed && (
        <p class="pp-error" role="alert">
          Couldn't save that. Try again.
        </p>
      )}
      <footer class="pp-foot">
        <Label>Collects nothing. Makes no network calls.</Label>
        <a class="pp-options" href="options.html" onClick={(e) => (e.preventDefault(), deps.openOptions())}>
          Options
        </a>
      </footer>
      <Label>Not made by or affiliated with Hulu.</Label>
    </main>
  );
}
