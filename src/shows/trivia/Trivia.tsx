import { useEffect, useRef, useState } from 'preact/hooks';
import type { Show, ShowControl, ShowProps } from '../types';
import bank from './questions.json';
import css from './trivia.css?inline';
import { NEXT_MS, hasTimeFor, markSeen, pickQuestions, questionCount, type Ask, type BankRow } from './pick';
import { loadSeen, saveSeen } from './seen';

const QUESTIONS = bank as BankRow[];
const LETTERS = ['A', 'B', 'C', 'D'];

type Run =
  | { kind: 'loading' }
  | { kind: 'ask'; asks: Ask[]; index: number; picked: number | null; right: number }
  | { kind: 'done'; right: number; total: number };

export function Trivia({ register }: ShowProps) {
  const [run, setRun] = useState<Run | null>(null);
  const runRef = useRef<Run | null>(null);
  const seen = useRef<string[]>([]);
  const deadline = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const alive = useRef(true);
  const set = (r: Run | null) => {
    runRef.current = r;
    setRun(r);
  };

  const left = () => (deadline.current === null ? null : (deadline.current - Date.now()) / 1000);

  const see = (id: string) => {
    seen.current = markSeen(seen.current, id, QUESTIONS.length);
    void saveSeen(seen.current);
  };

  const answer = (n: number) => {
    const r = runRef.current;
    const ask = r?.kind === 'ask' ? r.asks[r.index] : undefined;
    if (r?.kind !== 'ask' || !ask || r.picked !== null || n >= ask.answers.length) return;
    const right = r.right + (n === ask.right ? 1 : 0);
    set({ ...r, picked: n, right });
    advanceSoon();
  };

  const advanceSoon = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const now = runRef.current;
      if (now?.kind !== 'ask') return;
      const next = now.asks[now.index + 1];
      if (next && hasTimeFor(left())) {
        see(next.id);
        set({ ...now, index: now.index + 1, picked: null });
      } else {
        set({ kind: 'done', right: now.right, total: now.index + 1 });
      }
    }, NEXT_MS);
  };

  const begin = async (breakSeconds: number | null) => {
    deadline.current = breakSeconds === null ? null : Date.now() + breakSeconds * 1000;
    set({ kind: 'loading' });
    seen.current = await loadSeen();
    if (!alive.current || runRef.current?.kind !== 'loading') return;
    const asks = pickQuestions(QUESTIONS, seen.current, questionCount(breakSeconds));
    if (!asks[0]) return;
    see(asks[0].id);
    set({ kind: 'ask', asks, index: 0, picked: null, right: 0 });
  };

  useEffect(() => {
    alive.current = true;
    const control: ShowControl = {
      start(breakSeconds) {
        const r = runRef.current;
        // Back from another show part way through: carry on where it was, with the break's clock restarted.
        if (r?.kind === 'ask' || r?.kind === 'loading') {
          deadline.current = breakSeconds === null ? null : Date.now() + breakSeconds * 1000;
          if (r.kind === 'ask' && r.picked !== null) advanceSoon();
          return;
        }
        void begin(breakSeconds);
      },
      stop() {
        clearTimeout(timer.current);
      },
      key(e) {
        if (e.ctrlKey || e.altKey || e.metaKey) return false;
        const n = LETTERS.indexOf(e.key.toUpperCase());
        if (n < 0 || e.key.length !== 1) return false;
        answer(n);
        return true;
      },
    };
    register(control);
    return () => {
      alive.current = false;
      clearTimeout(timer.current);
      register(null);
    };
  }, [register]);

  const r = run;
  return (
    <div class="hs-trivia" data-state={r?.kind ?? 'idle'}>
      {r?.kind === 'ask' ? <Question r={r} onAnswer={answer} /> : null}
      {r?.kind === 'done' ? (
        <div class="t-wrap" key="done">
          <p class="lab t-n">Done</p>
          <p class="t-q">
            {r.right} of {r.total} right.{r.total === 3 ? ' Three more next break.' : ''}
          </p>
        </div>
      ) : null}
      {r?.kind === 'loading' ? (
        <div class="t-wrap" aria-busy="true">
          <p class="lab t-n">Question 1</p>
          <p class="t-q t-wait">One moment.</p>
        </div>
      ) : null}
      <p class="lab t-c">Questions from Open Trivia Database, CC BY-SA 4.0</p>
    </div>
  );
}

function Question({ r, onAnswer }: { r: Extract<Run, { kind: 'ask' }>; onAnswer(n: number): void }) {
  const ask = r.asks[r.index];
  if (!ask) return null;
  const state = (i: number) => {
    if (r.picked === null) return undefined;
    if (i === ask.right) return 'right';
    return i === r.picked ? 'wrong' : undefined;
  };
  return (
    <div class="t-wrap" key={ask.id}>
      <p class="lab t-n">
        Question {r.index + 1} of {r.asks.length}
      </p>
      <p class="t-q" id="t-question">
        {ask.question}
      </p>
      <div class="t-as" role="group" aria-labelledby="t-question">
        {ask.answers.map((a, i) => (
          <div class="t-row" key={a}>
            <button
              type="button"
              class="hs-answer t-a"
              data-s={state(i)}
              aria-keyshortcuts={LETTERS[i]}
              disabled={r.picked !== null}
              onClick={() => onAnswer(i)}
            >
              <span class="k" aria-hidden="true">
                {LETTERS[i]}
              </span>
              {a}
            </button>
            <span class={`t-say${r.picked === i ? ' on' : ''}`} role="status">
              {r.picked === i ? (i === ask.right ? 'Right' : 'Not this one') : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export const trivia: Show = { id: 'trivia', name: 'Quick trivia', line: 'Three questions', Component: Trivia, css };
