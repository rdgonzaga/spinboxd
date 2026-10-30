import { loadWatchlist } from "./data.js";
import { poolFor, randomInt } from "./pool.js";
import { posterEl } from "./poster.js";
import { spin, stopReel } from "./reel.js";
import { showResult } from "./result.js";

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
let spinId = 0;

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
      count.textContent = poolFor(data, key).length;
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

function renderPool() {
  const pool = poolFor(data, source);
  $("grid").replaceChildren(
    ...pool.map((film) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.className = "tile";
      a.href = film.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.title = film.year ? `${film.title} (${film.year})` : film.title;
      a.append(posterEl(film));
      li.append(a);
      return li;
    }),
  );

  const note = staleNote();
  $("note").textContent = note;
  $("note").hidden = !note;

  $("count").textContent = pool.length
    ? `${pool.length} ${pool.length === 1 ? "film" : "films"} in the pool`
    : "Nothing in this list yet.";
  $("pick").disabled = pool.length === 0;
}

async function pick() {
  const pool = poolFor(data, source);
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

  showResult(winner);
  setView("result");
  $("respin").focus();
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

  renderSources();
  renderPool();

  $("pick").addEventListener("click", pick);
  $("respin").addEventListener("click", pick);
  $("close").addEventListener("click", closeStage);
  $("stage").addEventListener("close", () => {
    spinId++;
    stopReel($("strip"));
  });
}

init();
