import type { Show } from './types';
import { placeholderShows } from './placeholder';
import { hoopsCatch } from './hoops-catch';

/** The halftime shows, in SHOW_IDS order. Each show's own issue swaps its placeholder for the real one. */
export const shows: Show[] = placeholderShows.map((s) => (s.id === 'catch' ? hoopsCatch : s));
