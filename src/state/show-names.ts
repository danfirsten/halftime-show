import type { ShowId } from '../shows/types';

/** The four shows' names, the same everywhere (docs/design.md, "Voice"). Kept here so the popup and options page
 *  need not load the shows themselves; a test checks they match the shows. */
export const SHOW_NAMES: Record<ShowId, string> = {
  words: 'Five letters',
  trivia: 'Quick trivia',
  catch: "Hoop's catch",
  look: 'Something to look at',
};
