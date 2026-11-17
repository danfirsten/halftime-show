import type { Show } from '../types';
import { FiveLetters } from './FiveLetters';
import css from './five-letters.css?inline';

export const fiveLetters: Show = {
  id: 'words',
  name: 'Five letters',
  line: 'Guess the word',
  Component: FiveLetters,
  css,
};
