import { expect, it } from 'vitest';
import { shows } from '.';
import { SHOW_IDS } from './types';

it('registers the four shows in SHOW_IDS order', () => {
  expect(shows.map((s) => s.id)).toEqual([...SHOW_IDS]);
});
