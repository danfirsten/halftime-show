import { describe, expect, it } from 'vitest';
import { shows } from '../shows';
import { SHOW_NAMES } from './show-names';

describe('show names', () => {
  it('match the shows', () => {
    for (const show of shows) expect(SHOW_NAMES[show.id]).toBe(show.name);
  });
});
