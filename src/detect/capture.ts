import { DURATION_MARK, HIDDEN_MARK, STALLED_MARK, findVideo, isShown, videoDuration, videoStalled } from './read';
import type { SiteProfile } from '../sites/types';

// The capture tool: a copy of the player's DOM that detection can be fixed against, with scripts and anything
// personal taken out. The options page asks for it; the content script answers (answerCaptureRequests).

export const CAPTURE_MESSAGE = 'detect:capture';

const DROP = 'script, noscript, iframe, object, embed, link, meta, template, input, textarea, select, form, img, picture, svg, canvas, source, track';
// Elements whose text is likely to be about the viewer, not the player.
const PERSONAL = /profile|account|avatar|user|email|e-mail|name/i;
const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
const URL_ATTRS = new Set(['src', 'href', 'srcset', 'poster', 'action', 'data-src', 'xlink:href']);
const KEEP_ATTRS = /^(id|class|role|hidden|data-state|data-fixture|aria-(label|hidden|valuenow|valuemin|valuemax|live))$/;
const UP_LEVELS = 3;

/** Keeps a URL's last path segment when it looks like a plain file name, and nothing else. */
export function scrubUrl(value: string): string {
  if (value.startsWith('blob:')) return 'blob:';
  const path = value.split(/[?#]/)[0] ?? '';
  const last = path.split('/').pop() ?? '';
  return /^[\w.-]{1,40}$/.test(last) && !/\d{6,}/.test(last) ? last : '';
}

function scrubText(text: string): string {
  return text.replace(EMAIL, '[email]');
}

/** The smallest piece of the page that holds the video and every ad marker on show, plus a little context. */
function captureRoot(doc: Document, site: SiteProfile): Element {
  const anchors: Element[] = [];
  const video = findVideo(doc, site);
  if (video) anchors.push(video);
  for (const spec of site.signals) for (const selector of spec.selectors) anchors.push(...doc.querySelectorAll(selector));
  if (anchors.length === 0) return doc.body;
  let root: Element = anchors[0]!;
  while (root !== doc.body && root.parentElement && !anchors.every((a) => root.contains(a))) root = root.parentElement;
  for (let i = 0; i < UP_LEVELS && root !== doc.body && root.parentElement; i++) root = root.parentElement;
  return root;
}

/** Records what a static copy would lose: which elements weren't rendered, and the video's state. */
function markLiveState(source: Element, copy: Element) {
  const live = [source, ...source.querySelectorAll('*')];
  const copied = [copy, ...copy.querySelectorAll('*')];
  live.forEach((el, i) => {
    const out = copied[i];
    if (!out) return;
    if (!isShown(el)) out.setAttribute(HIDDEN_MARK, '');
    if (el.tagName === 'VIDEO') {
      const duration = videoDuration(el as HTMLVideoElement);
      if (Number.isFinite(duration)) out.setAttribute(DURATION_MARK, String(Math.round(duration)));
      if (videoStalled(el as HTMLVideoElement)) out.setAttribute(STALLED_MARK, '');
    }
  });
}

function scrub(root: Element) {
  for (const el of root.querySelectorAll(DROP)) el.remove();
  for (const el of [root, ...root.querySelectorAll('*')]) {
    const label = `${el.id} ${el.getAttribute('class') ?? ''} ${el.getAttribute('aria-label') ?? ''}`;
    if (PERSONAL.test(label)) {
      el.textContent = '';
      el.removeAttribute('aria-label');
    }
    for (const attr of [...el.attributes]) {
      if (URL_ATTRS.has(attr.name)) el.setAttribute(attr.name, scrubUrl(attr.value));
      else if (attr.name.startsWith('data-ht-')) continue;
      else if (!KEEP_ATTRS.test(attr.name)) el.removeAttribute(attr.name);
      else el.setAttribute(attr.name, scrubText(attr.value));
    }
  }
  const walker = root.ownerDocument.createTreeWalker(root, 4 | 128 /* NodeFilter.SHOW_TEXT | SHOW_COMMENT */);
  const comments: Node[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === 8) comments.push(node);
    else node.nodeValue = scrubText(node.nodeValue ?? '');
  }
  for (const node of comments) node.parentNode?.removeChild(node);
}

/** A self-contained HTML file of the player as it is now, safe to share in a public issue. */
export function captureSnapshot(doc: Document, site: SiteProfile, when = new Date()): string {
  const source = captureRoot(doc, site);
  const copy = source.cloneNode(true) as Element;
  markLiveState(source, copy);
  scrub(copy);
  return [
    '<!doctype html>',
    `<!-- Halftime Show detection snapshot: site ${site.id}, ${when.toISOString().slice(0, 10)}. Scripts, links, images, form fields and personal text removed. -->`,
    copy.outerHTML,
    '',
  ].join('\n');
}

/** Lets the options page ask this tab for a snapshot. The content script calls this once (wired in #5). */
export function answerCaptureRequests(doc: Document, site: SiteProfile): () => void {
  const listener = (message: unknown) => {
    if ((message as { type?: string } | null)?.type !== CAPTURE_MESSAGE) return undefined;
    return Promise.resolve({ html: captureSnapshot(doc, site) });
  };
  browser.runtime.onMessage.addListener(listener);
  return () => browser.runtime.onMessage.removeListener(listener);
}
