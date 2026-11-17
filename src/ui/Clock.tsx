/** Format seconds as m:ss, or h:mm:ss from an hour up. Negative and fractional values are clamped and floored. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** A time in Geist Mono with tabular figures, so the digits don't jiggle as it counts. Pass seconds, or text such as "Ad break". */
export function Clock({ seconds, text, class: cls }: { seconds?: number; text?: string; class?: string }) {
  return <span class={['clock', 'num', cls].filter(Boolean).join(' ')}>{text ?? formatClock(seconds ?? 0)}</span>;
}
