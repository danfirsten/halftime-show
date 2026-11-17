// Where the overlay's host goes and the box it covers.

/** The element the host is appended to: the full-screen element when it holds the video (so the overlay stays on top
 *  in full screen), otherwise the video's own container. Never <body> unless the video has no parent. */
export function mountParent(video: Element, fullscreen: Element | null): Element {
  if (fullscreen && fullscreen !== video && fullscreen.contains(video)) return fullscreen;
  return video.parentElement ?? video.ownerDocument.body;
}

export interface Box { left: number; top: number; width: number; height: number }

/** The video's box in the coordinates of the host's containing block, so a host with `position: absolute` lands
 *  exactly over the picture whatever its parent is. */
export function coverBox(video: Element, host: HTMLElement): Box {
  const v = video.getBoundingClientRect();
  const doc = host.ownerDocument;
  const win = doc.defaultView ?? window;
  const op = host.offsetParent as HTMLElement | null;
  const positioned = op && !(op === doc.body && win.getComputedStyle(op).position === 'static');
  if (!op || !positioned) {
    // The containing block is the initial one: page coordinates.
    return { left: v.left + win.scrollX, top: v.top + win.scrollY, width: v.width, height: v.height };
  }
  const p = op.getBoundingClientRect();
  return {
    left: v.left - p.left - op.clientLeft + op.scrollLeft,
    top: v.top - p.top - op.clientTop + op.scrollTop,
    width: v.width,
    height: v.height,
  };
}
