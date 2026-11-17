import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Show, ShowProps } from '../types';
import { createBestStore } from './best';
import { createEngine, type Hud } from './engine';
import { MAX_MISSES } from './game';
import css from './hoops-catch.css?inline';

const START: Hud = { score: 0, best: 0, misses: 0, status: 'play', paused: null };

function note(hud: Hud): string {
  if (hud.status === 'over') return `Round over at ${hud.score}. Best ${hud.best}. Press space, or tap, to go again.`;
  if (hud.paused === 'break') return `Paused at ${hud.score} when the show came back. It carries on next break.`;
  if (hud.paused === 'hidden') return `Paused at ${hud.score}. It carries on when you are back.`;
  return '';
}

export function HoopsCatch({ register }: ShowProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useState<Hud>(START);
  const store = useMemo(() => createBestStore(), []);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const engine = createEngine(cv, { onHud: setHud, onBest: (n) => void store.save(n) });
    let alive = true;
    void store.load().then((best) => alive && engine.setBest(best));
    register(engine.control);
    return () => {
      alive = false;
      register(null);
      engine.destroy();
    };
  }, [register, store]);

  const text = note(hud);
  return (
    <div class="hs-catch">
      <canvas
        ref={canvas}
        class="c-cv"
        tabIndex={0}
        aria-label="Hoop's catch. Move Hoop with the left and right arrow keys, or with the pointer. Let a dot fall through the ring to catch it."
      />
      <div class="c-hud">
        <span class="c-score num" aria-label={`Score ${hud.score}`}>
          {hud.score}
        </span>
        <span class="lab">
          best <span class="num">{hud.best}</span>
        </span>
        <span class="c-miss" role="img" aria-label={`${hud.misses} of ${MAX_MISSES} misses used`}>
          {Array.from({ length: MAX_MISSES }, (_, i) => (
            <i key={i} class={i < hud.misses ? 'used' : ''} />
          ))}
        </span>
      </div>
      <p class="lab c-help">Arrow keys or the pointer</p>
      <p class={`c-over${text ? ' on' : ''}`} role="status">
        {text}
      </p>
    </div>
  );
}

export const hoopsCatch: Show = {
  id: 'catch',
  name: "Hoop's catch",
  line: 'Catch the falling dots',
  Component: HoopsCatch,
  css,
};
