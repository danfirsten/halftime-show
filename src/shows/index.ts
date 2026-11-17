import { SHOW_IDS, type Show } from './types';
import { placeholderShows } from './placeholder';
import { fiveLetters } from './five-letters';
import { hoopsCatch } from './hoops-catch';
import { look } from './look';

/** The four halftime shows, in SHOW_IDS order. Each show swaps its own line for the real one as it lands. */
const byId: Record<(typeof SHOW_IDS)[number], Show> = {
  words: fiveLetters,
  trivia: placeholderShows.find((s) => s.id === 'trivia')!,
  catch: hoopsCatch,
  look,
};
export const shows: Show[] = SHOW_IDS.map((id) => byId[id]);
