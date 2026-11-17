// Runs the game on a canvas: the frame loop, the pointer and keys, and the drawing. The rules are in game.ts.
// Drawing reads colours from the stylesheet's tokens (never named here), and nothing in a frame touches layout.
import { HOOP_RING } from '../../ui/Hoop';
import type { ShowControl } from '../types';
import { aim, createGame, restart, ringRadius, ringY, step, type Game } from './game';

export interface Hud {
  score: number;
  best: number;
  misses: number;
  status: 'play' | 'over';
  /** Why the game is stopped, if it is: the break ended or the show went off screen, or the tab is hidden. */
  paused: 'break' | 'hidden' | null;
}

export interface EngineOptions {
  onHud(hud: Hud): void;
  /** Called when a score beats the best. */
  onBest(score: number): void;
}

export interface Engine {
  control: ShowControl;
  game: Game;
  /** The best score, once it has loaded from storage. */
  setBest(best: number): void;
  destroy(): void;
}

const KEY_STEP = 0.09;
const MAX_DT = 0.05;

export function createEngine(cv: HTMLCanvasElement, { onHud, onBest }: EngineOptions): Engine {
  const doc = cv.ownerDocument;
  const win = doc.defaultView ?? window;
  const ctx = cv.getContext('2d');
  const ringPath = typeof Path2D === 'undefined' ? null : new Path2D(HOOP_RING);
  const game = createGame();
  const reducedQuery = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  let reduced = !!reducedQuery?.matches;
  let best = 0;
  let started = false;
  let raf = 0;
  let last = 0;
  let paused: Hud['paused'] = null;
  let ink = '';
  let rule = '';
  let shown: Hud | null = null;

  function emit() {
    const hud: Hud = { score: game.score, best, misses: game.misses, status: game.status, paused };
    if (shown && shown.score === hud.score && shown.best === hud.best && shown.misses === hud.misses && shown.status === hud.status && shown.paused === hud.paused) return;
    shown = hud;
    onHud(hud);
  }

  function readColours() {
    const style = win.getComputedStyle(cv);
    ink = style.color || ink;
    rule = style.getPropertyValue('--rule').trim() || ink;
  }

  function resize() {
    const d = Math.min(2, win.devicePixelRatio || 1);
    const w = cv.clientWidth;
    const h = cv.clientHeight;
    game.w = w;
    game.h = h;
    cv.width = Math.round(w * d);
    cv.height = Math.round(h * d);
    ctx?.setTransform(d, 0, 0, d, 0, 0);
    readColours();
    draw();
  }

  function draw() {
    if (!ctx || game.w <= 0) return;
    const { w, h } = game;
    const R = ringRadius(w, h);
    const hy = ringY(w, h);
    const hx = game.hx * w;
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = 1;
    // The ground rule, below Hoop.
    ctx.strokeStyle = rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, hy + R * 1.35);
    ctx.lineTo(w, hy + R * 1.35);
    ctx.stroke();
    // Dots, and which one Hoop watches: the lowest one still above it.
    let near: { x: number; y: number } | null = null;
    ctx.fillStyle = ink;
    for (const d of game.dots) {
      ctx.globalAlpha = d.caught ? Math.max(0, 1 - (d.y - hy) / (R * 1.2)) : 1;
      ctx.beginPath();
      ctx.arc(d.x * w, d.y, R * 0.19, 0, Math.PI * 2);
      ctx.fill();
      if (!d.caught && d.y < hy && (!near || d.y > near.y)) near = d;
    }
    ctx.globalAlpha = 1;
    // Hoop: the ring and its eyes, which follow the next dot (and stay still with reduced motion).
    ctx.save();
    ctx.translate(hx, hy);
    const s = R / 14.5;
    ctx.scale(s, s);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.8;
    if (ringPath) ctx.stroke(ringPath);
    ctx.fillStyle = ink;
    const ex = !reduced && near ? Math.max(-1, Math.min(1, (near.x * w - hx) / (R * 4))) * 1.8 : 0;
    const ey = !reduced && near ? Math.max(-1, Math.min(1, (near.y - hy) / (R * 4))) * 1.4 : 0;
    const ry = game.blink > 0 ? 0.4 : 2.9;
    for (const cx of [-5, 5]) {
      ctx.beginPath();
      ctx.ellipse(cx + ex, -1.4 + ey, 1.6, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function frame(t: number) {
    raf = win.requestAnimationFrame(frame);
    const dt = Math.min(MAX_DT, Math.max(0, (t - last) / 1000));
    last = t;
    const before = game.score;
    step(game, dt, { reduced, rng: Math.random });
    if (game.score > before && game.score > best) {
      best = game.score;
      onBest(best);
    }
    draw();
    emit();
  }

  function run() {
    if (raf || !started || paused) return;
    last = win.performance.now();
    raf = win.requestAnimationFrame(frame);
  }
  function halt() {
    win.cancelAnimationFrame(raf);
    raf = 0;
  }

  function onVisibility() {
    if (doc.visibilityState === 'hidden') {
      if (!started) return;
      halt();
      paused = 'hidden';
    } else if (paused === 'hidden') {
      paused = null;
      run();
    }
    emit();
  }
  function onMotion() {
    reduced = !!reducedQuery?.matches;
  }

  function again() {
    restart(game);
    emit();
  }

  function pointerX(e: PointerEvent): number {
    const r = cv.getBoundingClientRect();
    return r.width > 0 ? (e.clientX - r.left) / r.width : 0.5;
  }
  const onPointerMove = (e: PointerEvent) => aim(game, pointerX(e));
  const onPointerDown = (e: PointerEvent) => {
    aim(game, pointerX(e));
    if (game.status === 'over') again();
    try {
      cv.setPointerCapture(e.pointerId);
    } catch {
      // Not every pointer can be captured; moving still works over the canvas.
    }
  };

  const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
  ro?.observe(cv);
  doc.addEventListener('visibilitychange', onVisibility);
  reducedQuery?.addEventListener?.('change', onMotion);
  cv.addEventListener('pointermove', onPointerMove);
  cv.addEventListener('pointerdown', onPointerDown);
  resize();

  const control: ShowControl = {
    start() {
      started = true;
      paused = doc.visibilityState === 'hidden' ? 'hidden' : null;
      reduced = !!reducedQuery?.matches;
      readColours();
      emit();
      run();
    },
    stop() {
      started = false;
      halt();
      paused = game.score > 0 && game.status === 'play' ? 'break' : null;
      emit();
    },
    key(e) {
      if (e.ctrlKey || e.altKey || e.metaKey) return false;
      if (e.key === 'ArrowLeft') aim(game, game.tx - KEY_STEP);
      else if (e.key === 'ArrowRight') aim(game, game.tx + KEY_STEP);
      else if ((e.key === ' ' || e.key === 'Enter') && game.status === 'over') again();
      else return false;
      return true;
    },
  };

  return {
    control,
    game,
    setBest(n) {
      if (n > best) best = n;
      emit();
    },
    destroy() {
      halt();
      started = false;
      ro?.disconnect();
      doc.removeEventListener('visibilitychange', onVisibility);
      reducedQuery?.removeEventListener?.('change', onMotion);
      cv.removeEventListener('pointermove', onPointerMove);
      cv.removeEventListener('pointerdown', onPointerDown);
    },
  };
}
