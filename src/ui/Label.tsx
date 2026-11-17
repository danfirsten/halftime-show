import type { ComponentChildren } from 'preact';

/** Small mono text, sentence case. Never upper-cased. */
export function Label({ children, class: cls }: { children?: ComponentChildren; class?: string }) {
  return <span class={['label', cls].filter(Boolean).join(' ')}>{children}</span>;
}
