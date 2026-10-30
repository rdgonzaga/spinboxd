import { loadWatchlist } from "./data.js";
import { SORTS, applyFilters, filterOptions, poolFor, randomInt, sortFilms, withoutSkipped } from "./pool.js";
import { NO_FILTERS, isActive, loadFilters, renderFilters, save as saveFilters } from "./filters.js";
import { posterEl } from "./poster.js";
import { spin, stopReel } from "./reel.js";
import { showResult } from "./result.js";
import { copyOrShare, parsePickHash, pickHash, shareLink } from "./share.js";
import { initCloud } from "./cloud.js";
import { providerBadge } from "./providers.js";
import { openDatePicker } from "./datepicker.js";
import { dropdown } from "./dropdown.js";

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
const VIEWS = ["large", "small", "list"];
let sort = "list";
let view = "large";
let options;
let skipped = new Set();
let watched = new Set();
let watchedAt = new Map();
let user = null;
let denied = false;
let synced = true;
let cloud;
let spinId = 0;
let current = null;
let lastPick = store.get("spinboxd.last");
let copyTimer;

// browse: opened from a tile click, so it isn't "tonight's pick" and doesn't become the last pick
function present(film, { browse = false } = {}) {
  current = film;
  $("result-eyebrow").textContent = browse ? "Details" : "Tonight's pick";
  if (!browse && film.slug !== lastPick) {
    lastPick = film.slug;
    store.set("spinboxd.last", lastPick);
    renderPool();
  }
  $("respin").textContent = browse ? "Pick a film" : "Spin again";
  $("respin").hidden = source === "watched";
  showResult(film);
  renderResultMark();
  setView("result");
  if (browse) clearHash();
  else history.replaceState(null, "", pickHash(film.slug));
}

function focusResult() {
  ($("respin").hidden ? $("result-title") : $("respin")).focus();
}

function openFilm(film) {
  spinId++;
  stopReel($("strip"));
  if (!$("stage").open) $("stage").showModal();
  present(film, { browse: true });
  focusResult();
}

function openShared() {
  const slug = parsePickHash(location.hash);
  const film = slug && data.films.find((f) => f.slug === slug);
  if (!film) return;
  spinId++;
  stopReel($("strip"));
  if (!$("stage").open) $("stage").showModal();
  present(film);
  focusResult();
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
      if (synced) count.textContent = key === "watched" ? listFor(key).length : withoutSkipped(listFor(key), skipped).length;
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

function renderViewOpts() {
  $("sort").replaceChildren(
    dropdown({
      label: "Sort by",
      prefix: "Sort by",
      choices: Object.entries(SORTS),
      value: sort,
      onPick: (key) => {
        sort = key;
        store.set("spinboxd.sort", sort);
        renderViewOpts();
        renderPool();
      },
    }),
  );
  for (const key of VIEWS) $(`view-${key}`).setAttribute("aria-pressed", String(view === key));
  for (const key of VIEWS) $("grid").classList.toggle(`is-${key}`, view === key);
}

function rowMeta(film) {
  const meta = document.createElement("span");
  meta.className = "row-meta";
  const bits = [
    film.year,
    film.rating ? `★ ${film.rating.toFixed(1)}` : "",
    film.runtime ? `${film.runtime} min` : "",
  ].filter(Boolean);
  meta.textContent = bits.join(" · ");
  const stream = film.providers?.stream || [];
  if (stream.length) {
    const row = document.createElement("span");
    row.className = "plogos";
    for (const name of stream) row.append(providerBadge(name, film.providers) || `${name} `);
    meta.append(row);
  }
  return meta;
}

function timeAgo(iso) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000));
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return `${Math.round(hours / 24)} days ago`;
}

function dayLabel(d) {
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}

// Watched tab: the day each film was marked. Signed-in owners click it to change the day.
function tileFoot(film) {
  const at = watchedAt.get(film.slug);
  const editable = user && !denied;
  if (!at && !editable) return null;
  if (!editable) {
    const span = document.createElement("span");
    span.className = "tile-foot";
    span.textContent = dayLabel(at);
    return span;
  }
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "tile-foot is-editable";
  btn.textContent = at ? dayLabel(at) : "Set date";
  btn.title = "Change the date you watched it";
  btn.setAttribute("aria-haspopup", "dialog");
  btn.setAttribute("aria-label", `Date watched: ${film.title}, ${at ? dayLabel(at) : "not set"}. Change`);
  btn.addEventListener("click", () =>
    openDatePicker(btn, {
      value: at,
      max: new Date(),
      label: `Date watched: ${film.title}`,
      onPick: async (date) => {
        const error = await cloud.setWatchedAt(film.slug, date);
        if (!error) return;
        $("note").textContent =
          error === "permission-denied"
            ? "Couldn't save the date. Publish the latest firestore.rules (they need an update rule)."
            : `Couldn't save the date (${error}).`;
        $("note").hidden = false;
      },
    }),
  );
  return btn;
}

function renderListMeta(inWatched) {
  const meta = $("list-meta");
  const bar = $("progress");
  $("lead").textContent = inWatched ? "What you've watched" : "What do you wanna watch?";
  bar.hidden = !inWatched;
  const src = data.sources[source];
  const stamp = src ? src.scraped_at : data.generated_at;
  if (inWatched) {
    const total = data.films.length;
    const pct = total ? Math.round((watched.size / total) * 100) : 0;
    meta.textContent = `${watched.size} of ${total} films · ${pct}%`;
    $("progress-bar").style.width = `${pct}%`;
    meta.hidden = false;
  } else {
    meta.textContent = stamp ? `Updated ${timeAgo(stamp)}` : "";
    meta.hidden = !stamp;
  }
}

function renderPool() {
  const inWatched = source === "watched";
  const shown = sortFilms(applyFilters(listFor(source), filters), sort);
  const pool = inWatched ? [] : withoutSkipped(shown, skipped);
  const active = document.activeElement;
  const activeLi = active?.closest?.("#grid li");
  const keep = activeLi && {
    slug: activeLi.dataset.slug,
    index: [...$("grid").children].indexOf(activeLi),
    cls: active.classList[0],
  };
  $("grid").replaceChildren(
    ...shown.map((film) => {
      const isSkipped = skipped.has(film.slug);
      const li = document.createElement("li");
      li.dataset.slug = film.slug;
      li.classList.toggle("is-skipped", isSkipped);
      if (film.slug === lastPick && !inWatched) {
        const badge = document.createElement("span");
        badge.className = "badge";
        badge.textContent = "Last pick";
        li.append(badge);
      }
      const a = document.createElement("a");
      a.className = "tile";
      a.href = film.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      // a plain click opens the details card; modified clicks still go to Letterboxd
      a.addEventListener("click", (e) => {
        if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        openFilm(film);
      });
      a.title = film.year ? `${film.title} (${film.year})` : film.title;
      if (view === "list") {
        const title = document.createElement("strong");
        title.className = "row-title";
        title.textContent = film.title;
        const text = document.createElement("span");
        text.className = "row-text";
        text.append(title, rowMeta(film));
        a.append(posterEl(film), text);
      } else {
        a.append(posterEl(film, { size: view === "large" ? "w500" : "w342" }), caption(film));
      }
      li.append(a);
      const foot = inWatched && tileFoot(film);
      if (foot) li.append(foot);
      li.classList.toggle("has-foot", Boolean(foot));
      if (user) {
        const acts = document.createElement("div");
        acts.className = "acts";
        acts.append(markButton("watched", film, inWatched, () => toggleWatched(film)));
        if (!inWatched) acts.append(markButton("skip", film, isSkipped, () => cloud?.toggleSkip(film.slug)));
        li.append(acts);
      }
      return li;
    }),
  );

  if (keep) {
    const items = [...$("grid").children];
    const same = items.find((li) => li.dataset.slug === keep.slug);
    const target = same?.querySelector(`.${keep.cls}`) || (same || items[Math.min(keep.index, items.length - 1)])?.querySelector(".tile");
    target?.focus();
  }

  renderListMeta(inWatched);

  const note = staleNote();
  $("note").textContent = note;
  $("note").hidden = !note;

  const skippedCount = shown.length - pool.length;
  renderEmpty(shown.length === 0, inWatched);
  if (!shown.length) {
    $("count").textContent = inWatched ? "0 watched" : "0 films";
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

function renderEmpty(empty, inWatched) {
  $("empty").hidden = !empty;
  if (!empty) return;
  const filtered = isActive(filters);
  $("empty-clear").hidden = !filtered;
  $("empty-text").textContent = filtered
    ? "No films match these filters."
    : inWatched
      ? user
        ? "Nothing watched yet. Mark a film watched from its poster, or from the card after a pick."
        : "Nothing watched yet."
      : "Nothing in this list yet.";
}

// one undo at a time; a new action replaces the old offer
let toastTimer;
function offerUndo(text, undo) {
  clearTimeout(toastTimer);
  $("toast-text").textContent = text;
  $("toast").hidden = false;
  $("toast-undo").onclick = () => {
    hideToast();
    undo();
  };
  toastTimer = setTimeout(hideToast, 6000);
}

function hideToast() {
  clearTimeout(toastTimer);
  $("toast").hidden = true;
}

// marking watched (or moving back) takes the film out of the current tab, so offer an undo
async function toggleWatched(film) {
  const was = watched.has(film.slug);
  const at = watchedAt.get(film.slug);
  if (!(await cloud?.toggleWatched(film.slug))) return false;
  offerUndo(was ? `Moved ${film.title} back to the list` : `Marked ${film.title} watched`, () =>
    was && at ? cloud.setWatchedAt(film.slug, at) : cloud.toggleWatched(film.slug),
  );
  return true;
}

function renderAuth() {
  $("who").textContent = user ? (denied ? "View only" : user.email) : "";
  $("who").title = user ? (denied ? `${user.email} can't edit` : user.email) : "";
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
  focusResult();
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

  const savedSort = store.get("spinboxd.sort");
  sort = savedSort in SORTS ? savedSort : "list";
  const savedView = store.get("spinboxd.view");
  view = VIEWS.includes(savedView) ? savedView : "large";

  renderSources();
  renderFilterBar();
  renderViewOpts();
  renderPool();

  for (const key of VIEWS) {
    $(`view-${key}`).addEventListener("click", () => {
      view = key;
      store.set("spinboxd.view", key);
      renderViewOpts();
      renderPool();
    });
  }

  cloud = initCloud((next) => {
    skipped = next.skips;
    watched = next.watched;
    watchedAt = next.watchedAt;
    user = next.user;
    denied = next.denied;
    synced = next.synced;
    renderSources();
    renderPool();
    renderAuth();
    renderResultMark();
  });

  $("auth").addEventListener("click", async () => {
    if (user) return cloud.signOut();
    const error = await cloud.signIn();
    if (error) {
      $("note").textContent = `Couldn't sign in (${error}).`;
      $("note").hidden = false;
    }
  });
  $("result-watched").addEventListener("click", async () => {
    if (current && (await toggleWatched(current))) closeStage();
  });

  $("empty-clear").addEventListener("click", () => {
    saveFilters(NO_FILTERS);
    onFilters(NO_FILTERS);
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
  document.addEventListener("keydown", (e) => {
    const t = e.target;
    if (e.key !== " " || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if ($("stage").open || t.closest("button, a, select, input, textarea")) return;
    e.preventDefault();
    pick();
  });
  window.addEventListener("hashchange", openShared);
  openShared();
}

init();
