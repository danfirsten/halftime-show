import { SHOW_IDS, type Show } from './types';
import { placeholderShows } from './placeholder';
import { look } from './look';
import { trivia } from './trivia/Trivia';

/** The four halftime shows, in SHOW_IDS order. Each show swaps its own line for the real one as it lands. */
const byId: Record<(typeof SHOW_IDS)[number], Show> = {
  words: placeholderShows.find((s) => s.id === 'words')!,
  trivia,
  catch: placeholderShows.find((s) => s.id === 'catch')!,
  look,
};
export const shows: Show[] = SHOW_IDS.map((id) => byId[id]);
