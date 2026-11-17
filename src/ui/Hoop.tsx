/** Hoop, the ring. Drawn from assets/hoop.svg, in currentColor, so it is always the opposite of what is under it.
 *  Awake: eyes open. Asleep: the eyes are closed lines (paused). */
export const HOOP_RING =
  'M0,-14C8.2,-14 14.5,-8 14.5,1C14.5,9.2 8,13.6 0,13.6C-8,13.6 -14.5,9.2 -14.5,1C-14.5,-8 -8.2,-14 0,-14Z';
export const HOOP_EYES =
  'M-6.6,-1.4a1.6,2.9 0 1,0 3.2,0a1.6,2.9 0 1,0 -3.2,0Z M3.4,-1.4a1.6,2.9 0 1,0 3.2,0a1.6,2.9 0 1,0 -3.2,0Z';

export function Hoop({ asleep = false, title }: { asleep?: boolean; title?: string }) {
  return (
    <svg
      class="hoop"
      viewBox="-16 -16 32 32"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : 'true'}
      data-state={asleep ? 'asleep' : 'awake'}
    >
      <path fill="none" stroke="currentColor" stroke-width="1.8" d={HOOP_RING} />
      {asleep ? (
        <path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" d="M-6.8,-1.4h3.6 M3.2,-1.4h3.6" />
      ) : (
        <path fill="currentColor" d={HOOP_EYES} />
      )}
    </svg>
  );
}
