import type { Show, ShowId } from './types';
import { placeholderShows } from './placeholder';

// The show registry: the four halftime shows in SHOW_IDS order. Each show's own issue swaps its line here for the
// real show; until then it is the placeholder.

function placeholder(id: ShowId): Show {
  const show = placeholderShows.find((s) => s.id === id);
  if (!show) throw new Error(`no placeholder for ${id}`);
  return show;
}

export const shows: Show[] = [
  placeholder('words'),
  placeholder('trivia'),
  placeholder('catch'),
  placeholder('look'),
];
