import { Fragment } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Clock, Hoop, Label, Pill } from '../../src/ui';
import { CaptureButton } from './CaptureButton';
import { ShowChoice } from '../../src/settings/ShowChoice';
import { SiteSwitch } from '../../src/settings/SiteSwitch';
import { REPO_URL, StaleNote } from '../../src/settings/StaleNote';
import { useDetection, useSettings } from '../../src/settings/useSettings';
import { isStale } from '../../src/state/detection';
import { SITES, SITE_HOSTS } from '../../src/state/settings';
import { resetDodged, watchDodged, type Dodged } from '../../src/state/scoreboard';
import { OVERRIDE_COMMAND } from '../../src/lib/messages';

export interface OptionsDeps {
  watchDodged(onTotals: (dodged: Dodged) => void): () => void;
  resetDodged(): Promise<void>;
  /** The keys the browser has for the extension's command, or null when it can't say. */
  shortcut(): Promise<string | null>;
  firefox: boolean;
}

export const browserDeps: OptionsDeps = {
  watchDodged(onTotals) {
    try {
      return watchDodged(onTotals);
    } catch {
      return () => undefined;
    }
  },
  resetDodged,
  async shortcut() {
    try {
      const commands = await browser.commands.getAll();
      return commands.find((c) => c.name === OVERRIDE_COMMAND)?.shortcut || '';
    } catch {
      return null;
    }
  },
  firefox: typeof navigator !== 'undefined' && navigator.userAgent.includes('Firefox'),
};

const CC = 'https://creativecommons.org/licenses/by-sa/4.0/';
// Copied into every build by wxt.config.ts (LICENCES).
const LICENCE_LINKS: [string, string][] = [
  ['SCOWL-COPYRIGHT.txt', 'SCOWL'],
  ['QUESTIONS-LICENSE.txt', 'the question bank'],
  ['Geist-OFL.txt', 'Geist'],
  ['GeistMono-OFL.txt', 'Geist Mono'],
  ['LICENSE.txt', 'the code'],
];

function Reset({ deps }: { deps: OptionsDeps }) {
  const [state, setState] = useState<'idle' | 'asking' | 'done' | 'error'>('idle');
  async function reset() {
    try {
      await deps.resetDodged();
      setState('done');
    } catch {
      setState('error');
    }
  }
  return (
    <div class="op-reset-wrap">
      <div class="op-row">
        <Pill variant="outline" class="op-reset" aria-expanded={state === 'asking'} onClick={() => setState(state === 'asking' ? 'idle' : 'asking')}>
          Reset scoreboard
        </Pill>
        <p role="status" class="op-p">
          {state === 'done' && <Label>Reset. Back to 0:00.</Label>}
          {state === 'error' && <Label>Couldn't reset. Try again.</Label>}
        </p>
      </div>
      {state === 'asking' && (
        <div class="op-ask" role="group" aria-labelledby="op-ask-q">
          <p id="op-ask-q" class="op-p">
            Reset ad time dodged for today and this week? High scores stay.
          </p>
          <div class="op-row">
            <Pill variant="primary" class="op-confirm" onClick={reset}>
              Reset
            </Pill>
            <Pill variant="outline" onClick={() => setState('idle')}>
              Keep it
            </Pill>
          </div>
        </div>
      )}
    </div>
  );
}

/** The options page: the default show, the sites, the scoreboard, shortcuts, privacy and credits. */
export function Options({ deps = browserDeps }: { deps?: OptionsDeps }) {
  const { settings, change, saveFailed } = useSettings();
  const detection = useDetection();
  const [dodged, setDodged] = useState<Dodged>({ today: 0, week: 0 });
  const [shortcut, setShortcut] = useState<string | null | undefined>(undefined);
  useEffect(() => deps.watchDodged(setDodged), [deps]);
  useEffect(() => {
    let live = true;
    deps.shortcut().then((s) => live && setShortcut(s));
    return () => {
      live = false;
    };
  }, [deps]);

  const keys = shortcut || 'Alt+Shift+A';
  return (
    <main class="opts">
      <header class="op-head">
        <p class="wordmark">
          <Hoop />
          halftime show
        </p>
        <h1 class="op-title">Settings</h1>
      </header>
      {saveFailed && (
        <p class="op-p" role="alert">
          Couldn't save that. Try again.
        </p>
      )}
      {isStale(detection) && <StaleNote />}

      <section class="op-sec" aria-labelledby="op-show">
        <h2 id="op-show" class="op-h">
          Halftime show
        </h2>
        <p class="op-p">The menu counts down to this one at each break. With “Ask each break” it counts down to the show you used last.</p>
        <ShowChoice label="Default halftime show" value={settings.defaultShow} onChange={(defaultShow) => change({ defaultShow })} />
      </section>

      <section class="op-sec" aria-labelledby="op-sites">
        <h2 id="op-sites" class="op-h">
          Sites
        </h2>
        {SITES.map((site) => (
          <div class="op-line" key={site}>
            <span>{SITE_HOSTS[site]}</span>
            <SiteSwitch site={SITE_HOSTS[site]} on={settings.enabled[site]} onChange={(on) => change({ enabled: { [site]: on } })} />
          </div>
        ))}
        <p class="op-p">Off means no muting and no overlay on that site. A break already on ends at once.</p>
      </section>

      <section class="op-sec" aria-labelledby="op-score">
        <h2 id="op-score" class="op-h">
          Scoreboard
        </h2>
        <dl class="op-dl">
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
        <Reset deps={deps} />
      </section>

      <section class="op-sec" aria-labelledby="op-keys">
        <h2 id="op-keys" class="op-h">
          Shortcuts
        </h2>
        <dl class="op-dl op-keys">
          <div>
            <dt>
              <kbd>{keys}</kbd>
            </dt>
            <dd>This is an ad, or this isn't</dd>
          </div>
          <div>
            <dt>
              <kbd>1</kbd> to <kbd>4</kbd>
            </dt>
            <dd>Pick a halftime show during a break</dd>
          </div>
        </dl>
        {shortcut === '' && <p class="op-p">No keys are set for “This is an ad” in this browser yet. Set some below.</p>}
        <p class="op-p">
          {deps.firefox
            ? 'To change them in Firefox, open the Add-ons Manager, press the gear, and choose Manage Extension Shortcuts.'
            : 'To change them, open the extensions page in your browser and choose Keyboard shortcuts: in Chrome that is chrome://extensions/shortcuts.'}{' '}
          The halftime show never uses Esc, so it never leaves full screen.
        </p>
      </section>

      <section class="op-sec" aria-labelledby="op-privacy">
        <h2 id="op-privacy" class="op-h">
          Privacy
        </h2>
        <p class="op-p">Halftime Show collects nothing and makes no network calls. Your settings and scores stay in this browser. There are no accounts and no analytics, and the code is public.</p>
        <p class="op-p">It asks for three permissions, and only for these:</p>
        <ul class="op-list">
          <li>
            <b>Tabs</b>: to mute the tab during an ad break and unmute it after.
          </li>
          <li>
            <b>Storage</b>: to keep your settings, scores and ad time dodged in this browser.
          </li>
          <li>
            <b>Access to hulu.com</b>: to see when a break starts and to cover it. It never blocks, skips or speeds up an ad, and never touches Hulu's network traffic.
          </li>
        </ul>
      </section>

      <section class="op-sec" aria-labelledby="op-credits">
        <h2 id="op-credits" class="op-h">
          Credits
        </h2>
        <ul class="op-list">
          <li>
            Quick trivia: questions from{' '}
            <a href="https://opentdb.com" target="_blank" rel="noreferrer">
              Open Trivia Database
            </a>
            , shared under{' '}
            <a href={CC} target="_blank" rel="noreferrer">
              CC BY-SA 4.0
            </a>
            . A curated subset, changed as described in the repository.
          </li>
          <li>
            Five letters: word lists from{' '}
            <a href="http://wordlist.aspell.net/" target="_blank" rel="noreferrer">
              SCOWL
            </a>{' '}
            by Kevin Atkinson, mostly public domain.
          </li>
          <li>Type: Geist and Geist Mono by Vercel, under the SIL Open Font Licence 1.1.</li>
          <li>
            Code on{' '}
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              GitHub
            </a>{' '}
            (MIT). The question bank keeps its own licence.
          </li>
          <li>
            The full licence texts ship inside the extension:{' '}
            {LICENCE_LINKS.map(([file, name], i) => (
              <Fragment key={file}>
                {i > 0 && (i === LICENCE_LINKS.length - 1 ? ' and ' : ', ')}
                <a href={`licences/${file}`} target="_blank" rel="noreferrer">
                  {name}
                </a>
              </Fragment>
            ))}
            .
          </li>
        </ul>
      </section>

      <CaptureButton />
      <footer class="op-foot">
        <Label>Halftime Show is not made by or affiliated with Hulu.</Label>
      </footer>
    </main>
  );
}
