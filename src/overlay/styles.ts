import tokens from '../styles/tokens.css?inline';
import ui from '../ui/ui.css?inline';
import overlayTokens from './tokens.css?inline';
import overlay from './overlay.css?inline';
import type { Show } from '../shows/types';

/** Everything the shadow root needs, in one stylesheet: the system's tokens (with :root read as the shadow host, so
 *  nothing is set on the page), the ink pieces, the overlay and each show's own CSS. Nothing is added to the page. */
export function hostTokens(css: string): string {
  return css.replace(/:root/g, ':host');
}

export function overlayCss(shows: Show[]): string {
  const showCss = [...new Set(shows.map((s) => s.css).filter(Boolean))].join('\n');
  return [hostTokens(tokens), overlayTokens, ui, overlay, showCss].join('\n');
}
