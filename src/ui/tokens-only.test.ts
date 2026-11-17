import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

// Colours come only from src/styles/tokens.css: no hex, rgb() or named colour anywhere else.
describe('tokens only', () => {
  const files = [
    'src/ui/ui.css',
    'src/styles/base.css',
    'src/styles/fonts.css',
    'src/settings/settings.css',
    'entrypoints/popup/popup.css',
    'entrypoints/options/options.css',
  ];
  for (const f of files) {
    it(`${f} names no colour`, () => {
      const css = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(css).not.toMatch(/\brgba?\(|\bhsla?\(/);
      expect(css).not.toMatch(/:\s*(white|black|red|blue|green|gray|grey)\b/);
    });
  }
  it('there are no other stylesheets with colours', () => {
    expect(readdirSync('src/styles').sort()).toEqual(['base.css', 'fonts.css', 'tokens.css']);
  });
});
