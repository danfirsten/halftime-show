import type { Show, ShowId } from './types';
import { placeholderShows } from './placeholder';
import { trivia } from './trivia/Trivia';

function placeholder(id: ShowId): Show {
  const show = placeholderShows.find((s) => s.id === id);
  if (!show) throw new Error(`No placeholder for ${id}`);
  return show;
}

/** The four halftime shows in SHOW_IDS order. Each lands in its own issue; until then a placeholder holds its place. */
export const shows: Show[] = [placeholder('words'), trivia, placeholder('catch'), placeholder('look')];
