import type { Show } from './types';
import { placeholderShows } from './placeholder';
import { fiveLetters } from './five-letters';

const stand = (id: Show['id']): Show => placeholderShows.find((s) => s.id === id)!;

/** The four halftime shows, in SHOW_IDS order. Each issue swaps its own line from the placeholder to the real show. */
export const shows: Show[] = [fiveLetters, stand('trivia'), stand('catch'), stand('look')];
