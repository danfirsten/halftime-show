// The edge clock (docs/design.md, "the edge is the clock"): pure helpers, so they are unit-tested.

/** How far in from the video's border the line runs, matching the CSS token --edge-in: clamp(6px, 0.9cqi, 12px). */
export function edgeInset(width: number): number {
  return Math.min(12, Math.max(6, width * 0.009));
}

/** The rounded rectangle the 2 px line follows. Its path starts at the top-left corner and runs clockwise. */
export function edgeRect(width: number, height: number) {
  const inset = edgeInset(width);
  const w = Math.max(0, width - 2 * inset);
  const h = Math.max(0, height - 2 * inset);
  return { x: inset, y: inset, width: w, height: h, rx: Math.min(20, w / 2, h / 2) };
}

/** The path is measured as 1000 units. A negative dash offset eats the line from its start, so it drains clockwise
 *  from the top-left. Full at the start of the break, gone when the show is back. */
export function edgeOffset(left: number, total: number): number {
  if (!(total > 0)) return 0;
  const gone = 1 - Math.min(1, Math.max(0, left / total));
  return -Math.round(gone * 1000 * 10) / 10;
}

/** What the edge shows for a new time left. With reduced motion it jumps once every 5 s (and at the end); the time in
 *  the scoreboard carries the detail. */
export function edgeStep(shown: number | null, left: number, reduced: boolean): number {
  if (!reduced || shown === null || left <= 0 || left % 5 === 0 || left > shown) return left;
  return shown;
}
