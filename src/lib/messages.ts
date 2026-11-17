// The messages between the content script, the background and the popup (docs/product-brief.md, "Messages").

/** The content script holds one port open per tab. When it closes mid-break (the page went away), the background
 *  unmutes the tab. */
export const PORT_NAME = 'halftime:tab';

/** Content script to background, answered with `MuteReply`. */
export const BREAK_START = 'break:start';
export const BREAK_END = 'break:end';
/** Background or popup to content script: "this is an ad" or "this isn't", for the current break. Answered with `TabState`. */
export const COMMAND_OVERRIDE = 'command:override';
/** Popup to content script: is a break on? Answered with `TabState`. */
export const TAB_STATE = 'halftime:state';
/** Content script to background over the port, every so often during a break, so the service worker stays awake. */
export const PING = 'ping';

/** The keyboard command in wxt.config.ts. */
export const OVERRIDE_COMMAND = 'toggle-ad';

export interface BreakEndMessage {
  type: typeof BREAK_END;
  /** The viewer said this wasn't an ad: no ad time is counted. */
  notAd: boolean;
}

export interface MuteReply {
  /** Whether the tab is muted now. */
  muted: boolean;
  /** To `BREAK_START`: the browser can't mute the tab (Safari), so the content script mutes the page's video. */
  mutePage?: boolean;
}

export interface TabState {
  inBreak: boolean;
}

export function messageType(message: unknown): string | undefined {
  if (typeof message !== 'object' || message === null) return undefined;
  const type = (message as { type?: unknown }).type;
  return typeof type === 'string' ? type : undefined;
}
