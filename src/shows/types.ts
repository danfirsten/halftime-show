import type { ComponentType } from 'preact';

/** The four halftime shows, in menu order. Their keys are 1 to 4 in this order. */
export const SHOW_IDS = ['words', 'trivia', 'catch', 'look'] as const;
export type ShowId = (typeof SHOW_IDS)[number];

/** What the overlay can ask of a running show. Every show implements it. */
export interface ShowControl {
  /** The show is on screen: begin, or carry on. `breakSeconds` is the time left in the break, or null when it isn't known. */
  start(breakSeconds: number | null): void;
  /** The show is going off screen (another show was picked, or the break ended): pause and keep any state worth keeping. */
  stop(): void;
  /** A key pressed while the overlay is open. The overlay stops keys reaching the player, so a show gets them here.
   *  Return true when the show used the key. `1` to `4` never arrive here: they pick a show. */
  key?(event: KeyboardEvent): boolean;
}

export interface ShowProps {
  /** Call once on mount with the show's controls, and with null on unmount. */
  register(control: ShowControl | null): void;
}

export interface Show {
  id: ShowId;
  /** The name, the same everywhere: menu, tabs, popup, options. */
  name: string;
  /** The menu's one-line description. */
  line: string;
  Component: ComponentType<ShowProps>;
  /** The show's own stylesheet. The overlay lives in a Shadow DOM, so a show's CSS has to be handed to it. */
  css?: string;
}
