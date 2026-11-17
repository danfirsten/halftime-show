import { useEffect, useState } from 'preact/hooks';
import type { Show, ShowId, ShowProps } from '../types';
import css from './placeholder.css?inline';

// Stand-ins for the four halftime shows until each lands in its own issue (#6, #7, Hoop's catch and Something to
// look at). Each one keeps the real interface, so the overlay is built and tested against what the shows will be.
function placeholder(id: ShowId, name: string, line: string): Show {
  function Placeholder({ register }: ShowProps) {
    const [running, setRunning] = useState(false);
    useEffect(() => {
      register({ start: () => setRunning(true), stop: () => setRunning(false) });
      return () => register(null);
    }, [register]);
    return (
      <div class="ph" data-show={id} data-running={running ? 'true' : 'false'}>
        <p class="ph-name">{name}</p>
        <p class="ph-note">This halftime show is still being built. The ad is muted underneath until the show is back.</p>
      </div>
    );
  }
  Placeholder.displayName = `Placeholder(${id})`;
  return { id, name, line, Component: Placeholder, css };
}

export const placeholderShows: Show[] = [
  placeholder('words', 'Five letters', 'Guess the word'),
  placeholder('trivia', 'Quick trivia', 'Three questions'),
  placeholder('catch', "Hoop's catch", 'Catch the falling dots'),
  placeholder('look', 'Something to look at', 'Builds over the break'),
];
