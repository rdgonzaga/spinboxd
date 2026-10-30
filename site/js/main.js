import { loadWatchlist } from "./data.js";
import { filterOptions, poolFor, randomInt, visibleFilms, withoutSkipped } from "./pool.js";
import { NO_FILTERS, isActive, loadFilters, renderFilters } from "./filters.js";
import { posterEl } from "./poster.js";
import { spin, stopReel } from "./reel.js";
import { showResult } from "./result.js";
import { copyOrShare, parsePickHash, pickHash, shareLink } from "./share.js";
import { initSkips } from "./skips.js";

const $ = (id) => document.getElementById(id);
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

const store = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {}
  },
};

let data;
let source;
let filters = NO_FILTERS;
let options;
let skipped = new Set();
let skipsEnabled = false;
let skipsApi;
let spinId = 0;
let current = null;
let copyTimer;

function present(film) {
  current = film;
  showResult(film);
  setView("result");
  history.replaceState(null, "", pickHash(film.slug));
}

function openShared() {
  const slug = parsePickHash(location.hash);
  const film = slug && data.films.find((f) => f.slug === slug);
  if (!film) return;
  spinId++;
  stopReel($("strip"));
  if (!$("stage").open) $("stage").showModal();
  present(film);
  $("respin").focus();
}

async function copyLink() {
  if (!current) return;
  const btn = $("copy-link");
  const result = await copyOrShare(shareLink(current.slug), current.title);
  btn.textContent = result === "copied" ? "Link copied" : result === "failed" ? "Couldn't copy" : "Copy link";
  clearTimeout(copyTimer);
  copyTimer = setTimeout(() => (btn.textContent = "Copy link"), 2000);
}

function setView(view) {
  $("reel").hidden = view !== "reel";
  $("result").hidden = view !== "result";
}

function renderSources() {
  const keys = [...Object.keys(data.sources), "all"];
  $("sources").replaceChildren(
    ...keys.map((key) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.setAttribute("aria-pressed", String(key === source));
      const count = document.createElement("span");
      count.className = "n";
      count.textContent = withoutSkipped(poolFor(data, key), skipped).length;
      chip.append(key === "all" ? "All" : data.sources[key].label, count);
      chip.addEventListener("click", () => {
        source = key;
        store.set("spinboxd.source", key);
        renderSources();
        renderPool();
      });
      return chip;
    }),
  );
}

function staleNote() {
  const src = data.sources[source];
  if (!src || src.ok) return "";
  const when = src.scraped_at
    ? new Date(src.scraped_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : null;
  return when
    ? `${src.label} couldn't be refreshed, showing the list from ${when}.`
    : `${src.label} couldn't be refreshed.`;
}

function onFilters(next) {
  filters = next;
  renderFilterBar();
  renderPool();
}

function renderFilterBar() {
  renderFilters($("filters"), options, filters, onFilters);
}

const EYE = '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>';
const EYE_OFF = EYE + '<path d="M3 3l18 18"/>';

function skipButton(film, isSkipped) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "skip";
  btn.disabled = !skipsEnabled;
  btn.setAttribute("aria-pressed", String(isSkipped));
  btn.setAttribute("aria-label", `${isSkipped ? "Restore" : "Skip"} ${film.title}`);
  btn.title = skipsEnabled ? (isSkipped ? "Restore" : "Skip for now") : "Skips are offline";
  btn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${isSkipped ? EYE : EYE_OFF}</svg>`;
  btn.addEventListener("click", () => skipsApi?.toggle(film.slug));
  return btn;
}

// shown on hover and keyboard focus; posters with no title baked in need this
function caption(film) {
  const el = document.createElement("span");
  el.className = "caption";
  const title = document.createElement("strong");
  title.textContent = film.title;
  const meta = [film.year, film.rating ? `★ ${film.rating.toFixed(1)}` : ""].filter(Boolean).join(" · ");
  el.append(title);
  if (meta) el.append(meta);
  return el;
}

function renderPool() {
  const shown = visibleFilms(data, source, filters);
  const pool = withoutSkipped(shown, skipped);
  $("grid").replaceChildren(
    ...shown.map((film) => {
      const isSkipped = skipped.has(film.slug);
      const li = document.createElement("li");
      li.classList.toggle("is-skipped", isSkipped);
      const a = document.createElement("a");
      a.className = "tile";
      a.href = film.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.title = film.year ? `${film.title} (${film.year})` : film.title;
      a.append(posterEl(film), caption(film));
      li.append(a, skipButton(film, isSkipped));
      return li;
    }),
  );

  const note = staleNote();
  $("note").textContent = note;
  $("note").hidden = !note;

  const skippedCount = shown.length - pool.length;
  if (!shown.length) {
    $("count").textContent = isActive(filters) ? "Nothing matches those filters." : "Nothing in this list yet.";
  } else if (!pool.length) {
    $("count").textContent = "Everything's skipped.";
  } else {
    const noun = pool.length === 1 ? "film" : "films";
    const base = isActive(filters) ? `${pool.length} ${noun} match` : `${pool.length} ${noun} in the pool`;
    $("count").textContent = skippedCount ? `${base} · ${skippedCount} skipped` : base;
  }
  $("pick").disabled = pool.length === 0;
}

async function pick() {
  const pool = withoutSkipped(visibleFilms(data, source, filters), skipped);
  if (!pool.length) return;

  const id = ++spinId;
  const winner = pool[randomInt(pool.length)];
  const stage = $("stage");
  if (!stage.open) stage.showModal();

  if (!reduceMotion.matches) {
    setView("reel");
    await spin($("reel"), $("strip"), pool, winner).catch(() => {});
    if (id !== spinId) return;
  }

  present(winner);
  $("respin").focus();
}

function clearHash() {
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);
}

function closeStage() {
  spinId++;
  stopReel($("strip"));
  $("stage").close();
}

async function init() {
  try {
    data = await loadWatchlist();
  } catch {
    $("error").hidden = false;
    return;
  }

  const keys = [...Object.keys(data.sources), "all"];
  const saved = store.get("spinboxd.source");
  source = keys.includes(saved) ? saved : keys[0];

  options = filterOptions(data.films);
  filters = loadFilters(options);

  renderSources();
  renderFilterBar();
  renderPool();

  skipsApi = initSkips((slugs, enabled) => {
    skipped = slugs;
    skipsEnabled = enabled;
    renderSources();
    renderPool();
  });

  $("pick").addEventListener("click", pick);
  $("respin").addEventListener("click", pick);
  $("close").addEventListener("click", closeStage);
  $("copy-link").addEventListener("click", copyLink);
  $("stage").addEventListener("close", () => {
    spinId++;
    stopReel($("strip"));
    clearHash();
  });
  window.addEventListener("hashchange", openShared);
  openShared();
}

init();
