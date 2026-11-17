// Geist and Geist Mono for the overlay. @font-face rules inside a shadow root are ignored by Chrome, and a font file
// URL would resolve against the site's origin from a content script, so the two Latin files are bundled inline and
// registered with the FontFace API from their bytes: no request, no web-accessible resource, no <style> on the page.
// The family names are the ones src/styles/tokens.css asks for. Licence: assets/fonts-licence.md (SIL OFL 1.1).
import geist from '@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url&inline';
import geistMono from '@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2?url&inline';

const FAMILIES: [string, string][] = [
  ['Geist Variable', geist],
  ['Geist Mono Variable', geistMono],
];

function bytes(dataUrl: string): ArrayBuffer {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

const done = new WeakSet<Document>();

/** Adds the two faces to the document's font set once. Safe to call on every mount. */
export function registerFonts(doc: Document): void {
  if (done.has(doc)) return;
  done.add(doc);
  const win = doc.defaultView as (Window & { FontFace?: typeof FontFace }) | null;
  if (!win?.FontFace || !doc.fonts) return;
  for (const [family, url] of FAMILIES) {
    if ([...doc.fonts].some((f) => f.family.replace(/["']/g, '') === family)) continue;
    try {
      const face = new win.FontFace(family, bytes(url), { weight: '100 900', style: 'normal', display: 'swap' });
      doc.fonts.add(face);
      void face.load().catch(() => {});
    } catch {
      // A page that refuses the font still gets the system fallbacks in --sans and --mono.
    }
  }
}
