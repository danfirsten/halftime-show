import type { TargetedKeyboardEvent } from 'preact';
import { SHOW_IDS, type ShowId } from '../shows/types';
import { SHOW_NAMES } from '../state/show-names';

const CHOICES: (ShowId | null)[] = [null, ...SHOW_IDS];
const name = (id: ShowId | null) => (id === null ? 'Ask each break' : SHOW_NAMES[id]);

/** Which show the menu counts down to: one of the four, or "Ask each break" (the last one used). One choice at a time, arrow keys move it. */
export function ShowChoice({ value, onChange, label, class: cls }: { value: ShowId | null; onChange(show: ShowId | null): void; label: string; class?: string }) {
  function key(e: TargetedKeyboardEvent<HTMLButtonElement>) {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = CHOICES[(CHOICES.indexOf(value) + step + CHOICES.length) % CHOICES.length] ?? null;
    onChange(next);
    const group = e.currentTarget.parentElement;
    setTimeout(() => group?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus(), 0);
  }
  return (
    <div role="radiogroup" aria-label={label} class={['sh-choice', cls].filter(Boolean).join(' ')}>
      {CHOICES.map((id) => (
        <button
          key={id ?? 'ask'}
          type="button"
          role="radio"
          aria-checked={id === value}
          tabIndex={id === value ? 0 : -1}
          data-show={id ?? 'ask'}
          class={['pill', id === value ? 'pill-solid' : 'pill-line'].join(' ')}
          onClick={() => onChange(id)}
          onKeyDown={key}
        >
          {name(id)}
        </button>
      ))}
    </div>
  );
}
