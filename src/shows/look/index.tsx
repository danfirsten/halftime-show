import { useEffect, useRef } from 'preact/hooks';
import type { Show, ShowProps } from '../types';
import { keepDrawing, markAt, takeDrawing, type Pace } from './draw';
import css from './look.css?inline';

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Something to look at: a seeded ink drawing that builds across the break and completes as it ends. */
function Look({ register }: ShowProps) {
  const main = useRef<HTMLCanvasElement>(null);
  const fade = useRef<HTMLCanvasElement>(null);
  const note = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const cv = main.current!;
    const nv = fade.current!;
    const { seed, pace } = takeDrawing(performance.now());
    const state = { w: 0, h: 0, drawn: 0, raf: 0, ink: '242,242,238', timer: 0 };

    const paint = (target: HTMLCanvasElement, from: number, to: number) => {
      const c = target.getContext('2d');
      if (!c || !state.w) return;
      c.lineCap = 'round';
      for (let i = from; i < to; i++) {
        const m = markAt(seed, i, state.w, state.h);
        if (!m) continue;
        c.strokeStyle = `rgba(${state.ink},${m.alpha.toFixed(2)})`;
        c.lineWidth = m.width;
        c.beginPath();
        m.points.forEach(([x, y], k) => (k ? c.lineTo(x, y) : c.moveTo(x, y)));
        c.stroke();
      }
    };

    const size = () => {
      const r = cv.getBoundingClientRect();
      const d = Math.min(2, window.devicePixelRatio || 1);
      state.w = r.width;
      state.h = r.height;
      for (const el of [cv, nv]) {
        el.width = Math.round(r.width * d);
        el.height = Math.round(r.height * d);
        el.getContext('2d')?.setTransform(d, 0, 0, d, 0, 0);
      }
      const n = state.drawn;
      state.drawn = 0;
      paint(cv, 0, n);
      state.drawn = n;
    };

    const colour = () => {
      const m = /(\d+)[, ]+(\d+)[, ]+(\d+)/.exec(getComputedStyle(cv).color);
      if (m) state.ink = `${m[1]},${m[2]},${m[3]}`;
    };

    const frame = () => {
      state.raf = requestAnimationFrame(frame);
      pace.tick(performance.now());
      const target = pace.count(reducedMotion());
      const pct = String(Math.floor(pace.progress * 100));
      if (note.current && note.current.textContent !== pct) note.current.textContent = pct;
      if (target <= state.drawn) return;
      if (reducedMotion()) {
        // A batch: painted on the top canvas, faded in, then folded into the main one.
        nv.getContext('2d')?.clearRect(0, 0, state.w, state.h);
        paint(nv, state.drawn, target);
        state.drawn = target;
        nv.classList.add('on');
        clearTimeout(state.timer);
        state.timer = window.setTimeout(() => {
          const c = cv.getContext('2d');
          if (c) {
            c.save();
            c.setTransform(1, 0, 0, 1, 0, 0);
            c.drawImage(nv, 0, 0);
            c.restore();
          }
          nv.getContext('2d')?.clearRect(0, 0, state.w, state.h);
          nv.classList.remove('on');
        }, 260);
      } else {
        paint(cv, state.drawn, target);
        state.drawn = target;
      }
    };

    colour();
    size();
    // Redraw what is already there at once (a visit resumed mid-drawing), then carry on.
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(size) : null;
    ro?.observe(cv);
    const resumed = pace.count(false);
    if (resumed) {
      paint(cv, 0, resumed);
      state.drawn = resumed;
    }

    register({
      start: (seconds) => {
        pace.start(performance.now(), seconds);
        if (!state.raf) state.raf = requestAnimationFrame(frame);
      },
      stop: () => {
        pace.stop(performance.now());
        cancelAnimationFrame(state.raf);
        state.raf = 0;
      },
    });
    return () => {
      cancelAnimationFrame(state.raf);
      clearTimeout(state.timer);
      ro?.disconnect();
      pace.stop(performance.now());
      keepDrawing(performance.now(), seed, pace as Pace);
      register(null);
    };
  }, [register]);

  return (
    <div class="look" data-show="look">
      <canvas ref={main} class="look-cv" role="img" aria-label="A generative ink drawing that builds over the break" />
      <canvas ref={fade} class="look-new" aria-hidden="true" />
      <p class="look-note">
        <span ref={note}>0</span>% drawn. A new drawing every break
      </p>
    </div>
  );
}

export const look: Show = {
  id: 'look',
  name: 'Something to look at',
  line: 'Builds over the break',
  Component: Look,
  css,
};
