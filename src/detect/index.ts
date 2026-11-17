// What the content script (#5) uses: start the Hulu detector, read its debug hook, answer capture requests.
import { observe, type BreakEvent, type Detector, type ObserveOptions } from './observe';
import { answerCaptureRequests } from './capture';
import { hulu } from '../sites/hulu';

export type { BreakEvent, Detector, DetectorDebug } from './observe';
export { CAPTURE_MESSAGE } from './capture';

/** Watches this page for Hulu ad breaks. `detector.debug()` is the debug hook. */
export function detectHulu(doc: Document, onEvent: (event: BreakEvent) => void, options?: ObserveOptions): Detector {
  return observe(doc, hulu, onEvent, options);
}

/** Answers the options page's "Save a detection snapshot". Returns a function that stops answering. */
export function answerHuluCapture(doc: Document): () => void {
  return answerCaptureRequests(doc, hulu);
}
