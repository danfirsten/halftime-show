import type { ButtonHTMLAttributes, ComponentChildren } from 'preact';

export type PillProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  /** solid is the one main action; outline is everything else. */
  variant?: 'primary' | 'outline';
  children?: ComponentChildren;
};

/** A pill button, 48 px tall at least. */
export function Pill({ variant = 'primary', class: cls, children, ...rest }: PillProps) {
  const kind = variant === 'primary' ? 'pill-solid' : 'pill-line';
  return (
    <button type="button" {...rest} class={['pill', kind, cls].filter(Boolean).join(' ')}>
      {children}
    </button>
  );
}
