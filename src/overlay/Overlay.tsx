import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Hoop, formatClock } from '../ui';
import { SHOW_IDS, type Show, type ShowControl, type ShowId } from '../shows/types';
import { edgeOffset, edgeRect } from './edge';

export type Phase = 'closed' | 'open' | 'closing';

export interface OverlayState {
  phase: Phase;
  /** Goes up by one on every open, so each break gets a fresh menu and a fresh clip. */
  openId: number;
  /** The break's length and the time left, in seconds, or null while they aren't known. */
  total: number | null;
  left: number | null;
  /** The time left as the edge shows it (it steps every 5 s with reduced motion). */
  edgeLeft: number | null;
  width: number;
  height: number;
  dodged: { today: number; week: number };
  /** The show the menu starts by itself. Null before the first pick ever: the first menu waits. */
  lastShow: ShowId | null;
  note: { id: number; seconds: number } | null;
}

export interface OverlayActions {
  pick(show: ShowId): void;
  notAd(): void;
  closed(): void;
  noteDone(): void;
  /** The key guard hands every key pressed while the overlay is open to whatever is set here. */
  keys: { current: ((e: KeyboardEvent) => void) | null };
}

/** How long the back note holds, and its fade (--dur-hold and --dur-base in tokens). */
export const NOTE_HOLD_MS = 4000;
export const NOTE_FADE_MS = 220;
/** The menu counts down from this before starting the last show used. */
export const COUNTDOWN = 3;
/** In full screen the pointer hides after this long still. */
export const STILL_MS = 3000;
export const LARGE = 1100;

function isTyping(e: KeyboardEvent): boolean {
  const t = e.composedPath()[0];
  if (!(t instanceof Element)) return false;
  return t.matches('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
}

const GLYPHS: Record<ShowId, preact.JSX.Element> = {
  words: (
    <svg viewBox="0 0 44 10" aria-hidden="true">
      <g fill="none" stroke="currentColor" stroke-width="1.2">
        <rect x=".6" y=".6" width="7.4" height="8.8" rx="1.6" />
        <rect x="9.6" y=".6" width="7.4" height="8.8" rx="1.6" />
        <rect x="18.6" y=".6" width="7.4" height="8.8" rx="1.6" fill="currentColor" />
        <rect x="27.6" y=".6" width="7.4" height="8.8" rx="1.6" />
        <rect x="36.6" y=".6" width="7.4" height="8.8" rx="1.6" />
      </g>
    </svg>
  ),
  trivia: (
    <span class="q" aria-hidden="true">
      ?
    </span>
  ),
  catch: <Hoop />,
  look: (
    <svg viewBox="0 0 24 16" aria-hidden="true">
      <g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round">
        <path d="M1,4 q5,-4 11,0 t11,0" />
        <path d="M1,9 q5,-4 11,0 t11,0" />
        <path d="M1,14 q5,-4 11,0 t11,0" />
      </g>
    </svg>
  ),
};

function Edge({ total, left, edgeLeft, width, height }: Pick<OverlayState, 'total' | 'left' | 'edgeLeft' | 'width' | 'height'>) {
  const r = edgeRect(width, height);
  const known = total !== null && left !== null;
  return (
    <div
      class={`hs-edge${known ? '' : ' is-unknown'}`}
      role="progressbar"
      aria-label="Time left in this break"
      aria-valuemin={0}
      aria-valuemax={known ? total : undefined}
      aria-valuenow={known ? left : undefined}
      aria-valuetext={known ? `${formatClock(left)} left` : 'Ad break, length not known'}
    >
      <svg aria-hidden="true">
        {known ? (
          <>
            <rect class="e-track" {...r} />
            <rect class="e-run" {...r} pathLength={1000} style={{ strokeDashoffset: String(edgeOffset(edgeLeft ?? left, total)) }} />
          </>
        ) : (
          <rect class="e-dots" {...r} />
        )}
      </svg>
    </div>
  );
}

function Menu(props: {
  shows: Show[];
  known: boolean;
  left: number | null;
  first: boolean;
  preset: ShowId;
  countdown: number;
  choose(id: ShowId): void;
}) {
  const { shows, known, left, first, preset, countdown, choose } = props;
  return (
    <>
      <p class="m-head">
        {known ? (
          <>
            Ad break. <span class="num">{formatClock(left ?? 0)}</span> left. Pick a halftime show.
          </>
        ) : (
          'Ad break. Pick a halftime show.'
        )}
      </p>
      {first && (
        <p class="m-first">
          First break. The tab is muted and the ad is underneath. Pick something for{' '}
          {known ? (
            <>
              the next <span class="num">{formatClock(left ?? 0)}</span>.
            </>
          ) : (
            'the break.'
          )}
        </p>
      )}
      <ul class="hs-menu" aria-label="Halftime shows">
        {shows.map((s, i) => (
          <li key={s.id}>
            <button type="button" class={`m-row${s.id === preset ? ' is-default' : ''}`} data-show={s.id} onClick={() => choose(s.id)}>
              <span class="k" aria-hidden="true">
                {i + 1}
              </span>
              <span class="g">{GLYPHS[s.id]}</span>
              <span class="n">{s.name}</span>
              <span class="d">
                {s.id === preset && !first && countdown > 0 ? (
                  <>
                    Last time, starts in{' '}
                    <span class="m-c num" key={countdown}>
                      {countdown}
                    </span>
                  </>
                ) : (
                  s.line
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function Cover({ state, shows, actions }: { state: OverlayState; shows: Show[]; actions: OverlayActions }) {
  const { phase, total, left, width } = state;
  const known = total !== null && left !== null;
  const first = state.lastShow === null;
  const preset: ShowId = state.lastShow ?? shows[0]?.id ?? SHOW_IDS[0];
  const [cur, setCur] = useState<ShowId | 'menu'>('menu');
  const [countdown, setCountdown] = useState(first ? 0 : COUNTDOWN);
  const [still, setStill] = useState(false);
  const ctrl = useRef<ShowControl | null>(null);
  const leftRef = useRef(left);
  leftRef.current = left;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const closedOnce = useRef(false);
  const curRef = useRef<ShowId | 'menu'>('menu');

  const choose = useCallback(
    (id: ShowId) => {
      if (phaseRef.current !== 'open') return;
      setCountdown(0);
      if (curRef.current !== id) {
        ctrl.current?.stop();
        ctrl.current = null;
        curRef.current = id;
        setCur(id);
      }
      actions.pick(id);
    },
    [actions],
  );

  // The countdown to the last show used: 3, 2, 1, then it starts by itself.
  useEffect(() => {
    if (countdown <= 0 || cur !== 'menu' || phase !== 'open') return;
    const t = setTimeout(() => {
      if (countdown === 1) choose(preset);
      setCountdown(countdown - 1);
    }, 1000);
    return () => clearTimeout(t);
  }, [countdown, cur, phase, preset, choose]);

  // Any game pauses itself before the first frame of the close.
  useLayoutEffect(() => {
    if (phase === 'closing') ctrl.current?.stop();
  }, [phase]);
  useEffect(() => () => ctrl.current?.stop(), []);

  // Keys: a show sees each one first, then 1 to 4 pick a show.
  useEffect(() => {
    actions.keys.current = (e: KeyboardEvent) => {
      if (phaseRef.current !== 'open') return;
      if (ctrl.current?.key?.(e)) {
        e.preventDefault();
        return;
      }
      if (e.altKey || e.ctrlKey || e.metaKey || isTyping(e)) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= SHOW_IDS.length && e.key.length === 1) {
        const show = shows[n - 1];
        if (show) {
          e.preventDefault();
          choose(show.id);
        }
      }
    };
    return () => {
      actions.keys.current = null;
    };
  }, [actions, choose, shows]);

  // Full screen: the pointer hides after 3 s still.
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const wake = useCallback(() => {
    setStill(false);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStill(true), STILL_MS);
  }, []);
  useEffect(() => {
    wake();
    return () => clearTimeout(timer.current);
  }, [wake]);

  const register = useMemo(() => {
    let mine: ShowControl | null = null;
    return (c: ShowControl | null) => {
      if (c) {
        mine = c;
        ctrl.current = c;
        if (phaseRef.current === 'open') c.start(leftRef.current);
      } else if (mine && ctrl.current === mine) {
        ctrl.current = null;
        mine = null;
      }
    };
    // A new register for each show, so an old show unmounting never clears the new one's controls.
  }, [cur]);

  const show = cur === 'menu' ? null : shows.find((s) => s.id === cur);
  const onEnd = (e: AnimationEvent) => {
    if (e.target !== e.currentTarget || phaseRef.current !== 'closing' || closedOnce.current) return;
    if (e.animationName !== 'hs-clip-close' && e.animationName !== 'hs-fade-out') return;
    closedOnce.current = true;
    actions.closed();
  };

  return (
    <section
      class={`hs ${phase === 'closing' ? 'is-closing' : 'is-open'}${still && width >= LARGE ? ' is-still' : ''}`}
      tabIndex={-1}
      aria-label="Halftime show"
      onAnimationEnd={onEnd}
      onPointerMove={wake}
    >
      <Edge {...state} />
      <div class="hs-in">
        <div class="hs-top">
          <p class="hs-mark">
            <Hoop />
            <span>halftime show</span>
          </p>
          <div class="hs-score">
            <p class="hs-clock">
              <span class="hs-t num">{known ? formatClock(left) : 'Ad break'}</span>
              {known && <span class="lab hs-tl">left in this break</span>}
            </p>
            <p class="lab hs-d">
              Dodged today <span class="num">{formatClock(state.dodged.today)}</span>
            </p>
            <p class="lab hs-d">
              This week <span class="num">{formatClock(state.dodged.week)}</span>
            </p>
          </div>
        </div>
        <div class="hs-stage">
          <div class="pane" key={cur} data-pane={cur}>
            {show ? (
              <show.Component register={register} />
            ) : (
              <Menu shows={shows} known={known} left={left} first={first} preset={preset} countdown={countdown} choose={choose} />
            )}
          </div>
        </div>
        <div class="hs-foot">
          <div class="hs-tabs" role="tablist" aria-label="Halftime shows">
            {shows.map((s, i) => (
              <button type="button" role="tab" key={s.id} data-show={s.id} aria-selected={cur === s.id} onClick={() => choose(s.id)}>
                <span class="k">{i + 1}</span>
                <span class="n">{s.name}</span>
              </button>
            ))}
          </div>
          <button type="button" class="hs-notad" aria-keyshortcuts="Alt+Shift+A" onClick={() => actions.notAd()}>
            Not an ad <kbd>Alt Shift A</kbd>
          </button>
        </div>
      </div>
    </section>
  );
}

function BackNote({ seconds, done }: { seconds: number; done(): void }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setOn(true));
    const out = setTimeout(() => setOn(false), NOTE_FADE_MS + NOTE_HOLD_MS);
    const gone = setTimeout(done, NOTE_FADE_MS * 2 + NOTE_HOLD_MS);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(out);
      clearTimeout(gone);
    };
  }, [done]);
  return (
    <div class={`hs-back${on ? ' on' : ''}`}>
      <Hoop />
      <div>
        <b>Back. Sound on.</b>
        <span class="sub">
          <span class="num">{formatClock(seconds)}</span> of ads dodged.
        </span>
      </div>
    </div>
  );
}

export function OverlayView({ state, shows, actions }: { state: OverlayState; shows: Show[]; actions: OverlayActions }) {
  return (
    <div class="hs-root dark" data-surface="app">
      {state.phase !== 'closed' && <Cover key={state.openId} state={state} shows={shows} actions={actions} />}
      <div class="hs-live" role="status">
        {state.note && state.phase === 'closed' && <BackNote key={state.note.id} seconds={state.note.seconds} done={actions.noteDone} />}
      </div>
    </div>
  );
}
