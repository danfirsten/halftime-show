import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { ShowControl, ShowProps } from '../types';
import { ANSWERS, VALID } from './words';
import { describeGuess, keyMarks, scoreGuess, type Mark } from './score';
import { EMPTY, MAX_ROWS, load, pickAnswer, save, type Record5, type Saved } from './state';

/** After a game ends the next word starts by itself, but only if this many seconds of the break are left. */
export const NEXT_WORD_MIN_LEFT = 45;
export const NEXT_WORD_AFTER_MS = 3200;
export const BAD_WORD_MS = 1200;

const KEYS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

interface View {
  rec: Record5;
  typing: string;
  /** What is said under the board. */
  msg: string;
  /** The open row is outlined (dashed) because the word isn't in the list. */
  bad: boolean;
  /** The last guess in words, for screen readers. */
  heard: string;
}

const fresh = (): View => ({ rec: EMPTY, typing: '', msg: '', bad: false, heard: '' });

function newGame(rec: Record5): Record5 {
  const answer = pickAnswer(ANSWERS, rec.recent);
  const game: Saved = { answer, guesses: [], typing: '', done: false };
  return { ...rec, game, recent: [...rec.recent, answer] };
}

const word = (w: string) => w.toUpperCase();

export function FiveLetters({ register }: ShowProps) {
  const [view, setView] = useState<View>(fresh);
  const v = useRef(view);
  const apply = (next: View) => {
    v.current = next;
    setView(next);
  };
  const patch = (p: Partial<View>) => apply({ ...v.current, ...p });

  const loaded = useRef(false);
  const running = useRef(false);
  const endsAt = useRef<number | null>(null);
  const timers = useRef<{ bad?: ReturnType<typeof setTimeout>; next?: ReturnType<typeof setTimeout> }>({});

  const persist = () => {
    const { rec, typing } = v.current;
    void save(rec.game ? { ...rec, game: { ...rec.game, typing } } : rec);
  };

  const clearTimers = () => {
    clearTimeout(timers.current.bad);
    clearTimeout(timers.current.next);
    timers.current = {};
  };

  const secondsLeft = () => (endsAt.current === null ? null : Math.max(0, (endsAt.current - Date.now()) / 1000));

  /** Begin or carry on: a paused game resumes, a finished one gives way to a new word. */
  const begin = () => {
    const { rec } = v.current;
    if (!rec.game || rec.game.done) {
      apply({ ...v.current, rec: newGame(rec), typing: '', msg: '', bad: false, heard: '' });
    } else {
      apply({ ...v.current, typing: rec.game.typing, msg: rec.game.guesses.length > 0 ? 'Picked up where you left off.' : '', bad: false });
    }
    persist();
  };

  const finish = (rec: Record5, won: boolean, tries: number, answer: string) => {
    const streak = won ? rec.streak + 1 : 0;
    const sayStreak = won ? `Streak ${streak} this episode.` : 'Streak back to 0.';
    const msg = won ? `Got it in ${tries}. ${sayStreak}` : `It was ${word(answer)}. ${sayStreak}`;
    clearTimeout(timers.current.next);
    timers.current.next = setTimeout(() => {
      if (!running.current) return;
      const left = secondsLeft();
      if (left === null || left >= NEXT_WORD_MIN_LEFT) begin();
      else patch({ msg: `${msg} The next word waits for the next break.` });
    }, NEXT_WORD_AFTER_MS);
    return { rec: { ...rec, streak }, msg };
  };

  const submit = () => {
    const cur = v.current;
    const game = cur.rec.game;
    if (!game || game.done) return;
    const guess = cur.typing;
    if (guess.length < 5) return patch({ msg: 'Five letters, please.' });
    if (!VALID.has(guess)) {
      clearTimeout(timers.current.bad);
      timers.current.bad = setTimeout(() => patch({ bad: false, msg: v.current.msg === 'Not in the word list.' ? '' : v.current.msg }), BAD_WORD_MS);
      return patch({ bad: true, msg: 'Not in the word list.' });
    }
    const guesses = [...game.guesses, guess];
    const won = guess === game.answer;
    const over = won || guesses.length >= MAX_ROWS;
    let rec: Record5 = { ...cur.rec, lastPlayed: Date.now(), game: { ...game, guesses, typing: '', done: over } };
    let msg = '';
    if (over) ({ rec, msg } = finish(rec, won, guesses.length, game.answer));
    apply({ rec, typing: '', msg, bad: false, heard: describeGuess(guesses.length, guess, scoreGuess(guess, game.answer)) });
    void save(rec);
  };

  const type = useCallback((c: string) => {
    const { rec, typing } = v.current;
    if (!loaded.current || !running.current || !rec.game || rec.game.done || typing.length >= 5) return;
    patch({ typing: typing + c, bad: false, msg: '' });
  }, []);

  const del = useCallback(() => {
    const { rec, typing } = v.current;
    if (!loaded.current || !running.current || !rec.game || rec.game.done) return;
    patch({ typing: typing.slice(0, -1), bad: false, msg: '' });
  }, []);

  const press = (k: string) => {
    if (!loaded.current || !running.current) return;
    if (k === 'enter') submit();
    else if (k === 'del') del();
    else type(k);
  };

  useEffect(() => {
    let alive = true;
    const control: ShowControl = {
      start(breakSeconds) {
        running.current = true;
        endsAt.current = breakSeconds === null ? null : Date.now() + breakSeconds * 1000;
        if (loaded.current) begin();
      },
      stop() {
        running.current = false;
        clearTimers();
        if (loaded.current) persist();
      },
      key(e) {
        if (!running.current || !loaded.current || e.ctrlKey || e.metaKey || e.altKey) return false;
        if (e.key === 'Enter') press('enter');
        else if (e.key === 'Backspace') press('del');
        else if (/^[a-zA-Z]$/.test(e.key)) press(e.key.toLowerCase());
        else return false;
        return true;
      },
    };
    register(control);
    void load().then((rec) => {
      if (!alive) return;
      loaded.current = true;
      apply({ ...v.current, rec });
      if (running.current) begin();
    });
    return () => {
      alive = false;
      clearTimers();
      if (loaded.current && running.current) persist();
      register(null);
    };
    // The controls read everything through refs, so they are registered once.
  }, [register]);

  const { rec, typing, msg, bad, heard } = view;
  const game = rec.game;
  const guesses = game?.guesses ?? [];
  const rows = Array.from({ length: MAX_ROWS }, (_, i) => i);
  const marks = (i: number): Mark[] | null => (game && i < guesses.length ? scoreGuess(guesses[i] ?? '', game.answer) : null);
  const keyState = keyMarks(guesses.map((g, i) => ({ guess: g, marks: marks(i) ?? [] })));
  const open = game && !game.done ? guesses.length : -1;

  return (
    <div class="w-wrap" data-show="words">
      <div class="w-grid" role="group" aria-label="Five letters board">
        {rows.map((i) => {
          const m = marks(i);
          const isOpen = i === open;
          const guessed = guesses[i] ?? '';
          const letters = m ? guessed : isOpen ? typing : '';
          const label = m
            ? describeGuess(i + 1, guessed, m)
            : isOpen
              ? `Guess ${i + 1}, ${typing ? `typed so far ${[...typing].map((c) => c.toUpperCase()).join(' ')}` : 'empty'}.`
              : `Guess ${i + 1}, empty.`;
          return (
            <div
              key={i}
              class={`w-row${i === guesses.length - 1 ? ' is-last' : ''}${isOpen ? ' is-cur' : ''}${isOpen && bad ? ' is-bad' : ''}`}
              role="group"
              aria-label={label}
            >
              {[0, 1, 2, 3, 4].map((j) => (
                <div
                  key={j}
                  class={`w-tile${!m && letters[j] ? ' has' : ''}`}
                  data-s={m ? m[j] : undefined}
                  style={m ? { '--d': `${j * 60}ms` } : undefined}
                  aria-hidden="true"
                >
                  {letters[j] ?? ''}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <div class="w-side">
        <div class="w-kb" aria-label="Keyboard">
          {KEYS.map((row, r) => (
            <div key={row}>
              {r === 2 && <Key k="enter" label="Enter" wide press={press} />}
              {[...row].map((c) => (
                <Key key={c} k={c} label={c} mark={keyState.get(c)} press={press} />
              ))}
              {r === 2 && <Key k="del" label="Delete" wide press={press} />}
            </div>
          ))}
        </div>
        <p class="w-msg" data-bad={bad ? 'true' : undefined}>
          {msg}
        </p>
        <p class="label w-note">
          Streak <span class="num">{rec.streak}</span> this episode. Words from SCOWL.
        </p>
      </div>
      <p class="w-sr" role="status" aria-live="polite">
        {heard} {msg}
      </p>
    </div>
  );
}

const SAY: Record<Mark, string> = { hit: 'right place', near: 'in the word, wrong place', no: 'not in the word' };

function Key({ k, label, mark, wide, press }: { k: string; label: string; mark?: Mark; wide?: boolean; press(k: string): void }) {
  return (
    <button
      type="button"
      class={wide ? 'wide' : undefined}
      data-k={k}
      data-s={mark}
      tabIndex={-1}
      aria-label={mark ? `${label.toUpperCase()}, ${SAY[mark]}` : label.length === 1 ? label.toUpperCase() : label}
      // Keep focus where it is: the overlay's keys go to the show, and a click shouldn't move them.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => press(k)}
    >
      {label}
    </button>
  );
}
