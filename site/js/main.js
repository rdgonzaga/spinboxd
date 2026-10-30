import { loadWatchlist } from "./data.js";
import { applyFilters, filterOptions, poolFor, randomInt, withoutSkipped } from "./pool.js";
import { NO_FILTERS, isActive, loadFilters, renderFilters } from "./filters.js";
import { posterEl } from "./poster.js";
import { spin, stopReel } from "./reel.js";
import { showResult } from "./result.js";
import { copyOrShare, parsePickHash, pickHash, shareLink } from "./share.js";
import { initCloud } from "./cloud.js";

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
let watched = new Set();
let user = null;
let denied = false;
let cloud;
let spinId = 0;
let current = null;
let copyTimer;

function present(film) {
  current = film;
  showResult(film);
  renderResultMark();
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

const sourceKeys = () => [...Object.keys(data.sources), "all", "watched"];

// watched films live in their own tab and leave every other list
function listFor(key) {
  if (key === "watched") return data.films.filter((f) => watched.has(f.slug));
  return poolFor(data, key).filter((f) => !watched.has(f.slug));
}

function sourceLabel(key) {
  return key === "all" ? "All" : key === "watched" ? "Watched" : data.sources[key].label;
}

function renderSources() {
  const keys = sourceKeys();
  $("sources").replaceChildren(
    ...keys.map((key) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.setAttribute("aria-pressed", String(key === source));
      const count = document.createElement("span");
      count.className = "n";
      count.textContent = key === "watched" ? listFor(key).length : withoutSkipped(listFor(key), skipped).length;
      chip.append(sourceLabel(key), count);
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

const CHECK = '<path d="M5 12.5l4.5 4.5L19 7.5"/>';
const UNDO = '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/>';

function markButton(kind, film, on, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = kind === "skip" ? "skip" : "mark";
  btn.setAttribute("aria-pressed", String(on));
  const label = kind === "skip" ? (on ? "Restore" : "Skip for now") : on ? "Move back to the list" : "Mark watched";
  btn.setAttribute("aria-label", `${label}: ${film.title}`);
  btn.title = label;
  const icon = kind === "skip" ? (on ? EYE : EYE_OFF) : on ? UNDO : CHECK;
  btn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>`;
  btn.addEventListener("click", onClick);
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
  const inWatched = source === "watched";
  const shown = applyFilters(listFor(source), filters);
  const pool = inWatched ? [] : withoutSkipped(shown, skipped);
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
      li.append(a);
      if (user) {
        if (!inWatched) li.append(markButton("skip", film, isSkipped, () => cloud?.toggleSkip(film.slug)));
        li.append(markButton("watched", film, inWatched, () => cloud?.toggleWatched(film.slug)));
      }
      return li;
    }),
  );

  const note = staleNote();
  $("note").textContent = note;
  $("note").hidden = !note;

  const skippedCount = shown.length - pool.length;
  if (!shown.length) {
    $("count").textContent = isActive(filters)
      ? "Nothing matches those filters."
      : inWatched
        ? "Nothing watched yet."
        : "Nothing in this list yet.";
  } else if (inWatched) {
    $("count").textContent = `${shown.length} watched`;
  } else if (!pool.length) {
    $("count").textContent = "Everything's skipped.";
  } else {
    const noun = pool.length === 1 ? "film" : "films";
    const base = isActive(filters) ? `${pool.length} ${noun} match` : `${pool.length} ${noun} in the pool`;
    $("count").textContent = skippedCount ? `${base} · ${skippedCount} skipped` : base;
  }
  $("pick").hidden = inWatched;
  $("pick").disabled = pool.length === 0;
}

function renderAuth() {
  $("who").textContent = user ? (denied ? `${user.email} can't edit` : user.email) : "";
  $("auth").textContent = user ? "Sign out" : "Sign in";
}

function renderResultMark() {
  const btn = $("result-watched");
  btn.hidden = !user || !current;
  if (current) btn.textContent = watched.has(current.slug) ? "Move back to list" : "Mark watched";
}

async function pick() {
  const pool = withoutSkipped(applyFilters(listFor(source), filters), skipped);
  if (source === "watched" || !pool.length) return;

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

  const keys = sourceKeys();
  const saved = store.get("spinboxd.source");
  source = keys.includes(saved) ? saved : keys[0];

  options = filterOptions(data.films);
  filters = loadFilters(options);

  renderSources();
  renderFilterBar();
  renderPool();

  cloud = initCloud((next) => {
    skipped = next.skips;
    watched = next.watched;
    user = next.user;
    denied = next.denied;
    renderSources();
    renderPool();
    renderAuth();
    renderResultMark();
  });

  $("auth").addEventListener("click", async () => {
    if (user) return cloud.signOut();
    const error = await cloud.signIn();
    if (error) $("who").textContent = `Sign-in failed (${error})`;
  });
  $("result-watched").addEventListener("click", async () => {
    if (current && (await cloud.toggleWatched(current.slug))) closeStage();
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
