import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';

const out = path.resolve('.output/chrome-mv3');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

test('the built extension bundles its fonts and names no remote font or URL to fetch', () => {
  assert.ok(fs.existsSync(path.join(out, 'manifest.json')), 'run npm run build first');
  const files = walk(out);
  assert.ok(files.some((f) => /geist-latin-wght-normal.*\.woff2$/.test(f)), 'Geist is bundled');
  assert.ok(files.some((f) => /geist-mono-latin-wght-normal.*\.woff2$/.test(f)), 'Geist Mono is bundled');
  for (const f of files.filter((f) => /\.(css|html|js)$/.test(f))) {
    const text = fs.readFileSync(f, 'utf8');
    assert.ok(!/fonts\.(googleapis|gstatic)\.com/.test(text), `${f} points at a font host`);
    for (const m of text.matchAll(/@font-face[^}]*url\(([^)]*)\)/g)) {
      assert.ok(!/^["']?(https?:)?\/\//.test(m[1]), `${f}: remote font ${m[1]}`);
    }
  }
});

test('the popup and options pages are built', () => {
  assert.ok(fs.existsSync(path.join(out, 'popup.html')));
  assert.ok(fs.existsSync(path.join(out, 'options.html')));
});
