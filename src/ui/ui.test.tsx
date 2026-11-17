// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { render } from 'preact';
import { Pill, Label, Mark, Hoop, Clock, formatClock } from './index';
import { HOOP_RING, HOOP_EYES } from './Hoop';

function mount(vnode: preact.VNode) {
  const el = document.createElement('div');
  render(vnode, el);
  return el;
}

describe('Pill', () => {
  it('renders a primary and an outline button', () => {
    expect(mount(<Pill>Go</Pill>).querySelector('button.pill.pill-solid')?.textContent).toBe('Go');
    expect(mount(<Pill variant="outline">Go</Pill>).querySelector('button.pill.pill-line')).not.toBeNull();
  });
  it('is 48 px at least in the stylesheet', () => {
    expect(readFileSync('src/ui/ui.css', 'utf8')).toMatch(/\.pill \{[^}]*min-height: 48px/);
  });
});

describe('Label', () => {
  it('keeps sentence case', () => {
    expect(mount(<Label>Dodged today</Label>).querySelector('.label')?.textContent).toBe('Dodged today');
    expect(readFileSync('src/ui/ui.css', 'utf8')).toMatch(/\.label \{[^}]*text-transform: none/);
  });
});

describe('Mark', () => {
  it('renders each of the five marks with a plain-words name', () => {
    for (const kind of ['live', 'solid', 'ring', 'dotted', 'dashed'] as const) {
      const m = mount(<Mark kind={kind} />).querySelector('[data-mark]')!;
      expect(m.getAttribute('data-mark')).toBe(kind);
      expect(m.getAttribute('aria-label')).toBeTruthy();
    }
  });
});

describe('Mark, beside words', () => {
  it('is hidden from screen readers when its label is empty', () => {
    const m = mount(<Mark kind="solid" label="" />).querySelector('[data-mark]')!;
    expect(m.getAttribute('aria-hidden')).toBe('true');
    expect(m.getAttribute('role')).toBeNull();
  });
});

describe('Hoop', () => {
  it('is drawn from assets/hoop.svg in currentColor', () => {
    const svg = readFileSync('assets/hoop.svg', 'utf8');
    expect(svg).toContain(HOOP_RING);
    expect(svg).toContain(HOOP_EYES);
    const html = mount(<Hoop />).innerHTML;
    expect(html).toContain('currentColor');
    expect(html).not.toMatch(/#[0-9a-f]{3,6}/i);
  });
  it('has awake and asleep', () => {
    expect(mount(<Hoop />).querySelector('[data-state="awake"] path[fill="currentColor"]')).not.toBeNull();
    expect(mount(<Hoop asleep />).querySelector('[data-state="asleep"]')).not.toBeNull();
    expect(mount(<Hoop asleep />).innerHTML).not.toContain(HOOP_EYES);
  });
});

describe('Clock', () => {
  it('formats m:ss and h:mm:ss', () => {
    expect(formatClock(102)).toBe('1:42');
    expect(formatClock(9)).toBe('0:09');
    expect(formatClock(6730)).toBe('1:52:10');
    expect(formatClock(-4)).toBe('0:00');
  });
  it('uses tabular figures', () => {
    const el = mount(<Clock seconds={102} />).querySelector('.clock')!;
    expect(el.textContent).toBe('1:42');
    expect(el.className).toContain('num');
    expect(readFileSync('src/ui/ui.css', 'utf8')).toMatch(/tabular-nums/);
  });
});
