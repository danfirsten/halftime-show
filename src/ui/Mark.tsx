export type MarkKind = 'live' | 'solid' | 'ring' | 'dotted' | 'dashed';

/** What each mark says, in plain words, so a screen reader gets the state and not a shape. */
export const MARK_LABELS: Record<MarkKind, string> = {
  live: 'In a break',
  solid: 'Watching',
  ring: 'Paused',
  dotted: 'Off',
  dashed: 'Not this one',
};

/** The five marks. State is shown by shape, never by colour: a breathing disc, a disc, a ring, a dotted ring, a dashed ring. */
export function Mark({ kind, label }: { kind: MarkKind; label?: string }) {
  const cls = kind === 'solid' ? 'mark' : kind === 'live' ? 'mark mark-live' : `mark mark-${kind}`;
  // An empty label means the words beside the mark already say it: the mark is then decoration.
  if (label === '') return <span class={cls} aria-hidden="true" data-mark={kind} />;
  return <span class={cls} role="img" aria-label={label ?? MARK_LABELS[kind]} data-mark={kind} />;
}
