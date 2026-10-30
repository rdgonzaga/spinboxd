import { randomInt } from "./pool.js";
import { posterEl } from "./poster.js";

const LENGTH = 36;
const STOP_AT = 30;
const DURATION = 3800;

function fill(pool, winner) {
  const cells = [];
  for (let i = 0; i < LENGTH; i++) {
    if (i === STOP_AT) {
      cells.push(winner);
      continue;
    }
    const prev = cells[i - 1];
    let options = pool.filter((f) => f !== winner && f !== prev);
    if (!options.length) options = pool;
    cells.push(options[randomInt(options.length)]);
  }
  return cells;
}

export function stopReel(strip) {
  strip.getAnimations().forEach((a) => a.cancel());
}

// resolves once the strip has settled on `winner`
export function spin(viewport, strip, pool, winner) {
  stopReel(strip);
  strip.replaceChildren(...fill(pool, winner).map((f) => posterEl(f, { eager: true })));

  const cell = strip.children[STOP_AT];
  const drift = (Math.random() - 0.5) * cell.offsetWidth * 0.4;
  const stopX = viewport.clientWidth / 2 - (cell.offsetLeft + cell.offsetWidth / 2) + drift;

  const run = strip.animate(
    [{ transform: "translateX(0)" }, { transform: `translateX(${stopX}px)` }],
    { duration: DURATION, easing: "cubic-bezier(0.1, 0.55, 0.12, 1)", fill: "forwards" },
  );
  return run.finished;
}
