import { Mark } from '../ui';

/** On or off for one site. A switch with words as well as a mark: the state is never shown by colour. */
export function SiteSwitch({ site, on, onChange, class: cls }: { site: string; on: boolean; onChange(on: boolean): void; class?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={`Halftime Show on ${site}`} class={['pill', 'pill-line', 'sw', cls].filter(Boolean).join(' ')} onClick={() => onChange(!on)}>
      <span class="sw-word">{on ? 'On' : 'Off'}</span>
      <Mark kind={on ? 'solid' : 'dotted'} label="" />
    </button>
  );
}
