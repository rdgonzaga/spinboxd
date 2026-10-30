import { randomInt } from "./pool.js";
import { posterEl } from "./poster.js";

const LENGTH = 36;
const STOP_AT = 30;
const DURATION = 3800;
// how long the winner sits highlighted before the card replaces the reel
const LANDED = 650;
// same breakpoint as the phones block in style.css
const PHONE = matchMedia("(max-width: 560px)");

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
  strip.classList.remove("is-landed");
}

// resolves once the strip has settled on `winner` and held it for a beat
export async function spin(viewport, strip, pool, winner) {
  stopReel(strip);
  const sizes = getComputedStyle(viewport).getPropertyValue("--reel-cell").trim() || "150px";
  strip.replaceChildren(...fill(pool, winner).map((f) => posterEl(f, { eager: true, sizes })));

  const cell = strip.children[STOP_AT];
  cell.classList.add("is-winner");
  const drift = (Math.random() - 0.5) * cell.offsetWidth * 0.4;
  const stopX = viewport.clientWidth / 2 - (cell.offsetLeft + cell.offsetWidth / 2) + drift;

  const run = strip.animate(
    [{ transform: "translateX(0)" }, { transform: `translateX(${stopX}px)` }],
    { duration: DURATION, easing: "cubic-bezier(0.1, 0.55, 0.12, 1)", fill: "forwards" },
  );
  await run.finished;
  if (!PHONE.matches) return;

  // phones: slide the winner to dead centre, then hold it
  const centre = viewport.clientWidth / 2 - (cell.offsetLeft + cell.offsetWidth / 2);
  await strip.animate(
    [{ transform: `translateX(${stopX}px)` }, { transform: `translateX(${centre}px)` }],
    { duration: 260, easing: "ease-out", fill: "forwards" },
  ).finished;
  strip.classList.add("is-landed");
  navigator.vibrate?.(12);
  await new Promise((r) => setTimeout(r, LANDED));
}
