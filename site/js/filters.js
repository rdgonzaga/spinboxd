const KEY = "spinboxd.filters";
const RUNTIMES = [90, 120, 150];

export const NO_FILTERS = { maxRuntime: null, genre: null, decade: null };

export function isActive(filters) {
  return Object.values(filters).some((v) => v !== null);
}

export function loadFilters(options) {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {}
  // drop values the data no longer has, so a stale filter can't hide everything
  return {
    maxRuntime: RUNTIMES.includes(saved.maxRuntime) ? saved.maxRuntime : null,
    genre: options.genres.includes(saved.genre) ? saved.genre : null,
    decade: options.decades.includes(saved.decade) ? saved.decade : null,
  };
}

function save(filters) {
  try {
    localStorage.setItem(KEY, JSON.stringify(filters));
  } catch {}
}

function select(label, choices, value, onPick) {
  const wrap = document.createElement("label");
  wrap.className = "filter";
  const text = document.createElement("span");
  text.textContent = label;
  const el = document.createElement("select");
  for (const [val, name] of [["", "Any"], ...choices]) {
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = name;
    el.append(opt);
  }
  el.value = value === null ? "" : String(value);
  el.addEventListener("change", () => onPick(el.value === "" ? null : el.value));
  wrap.append(text, el);
  return wrap;
}

export function renderFilters(container, options, filters, onChange) {
  const set = (patch) => {
    const next = { ...filters, ...patch };
    save(next);
    onChange(next);
  };
  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "link-btn";
  clear.textContent = "Clear";
  clear.hidden = !isActive(filters);
  clear.addEventListener("click", () => set(NO_FILTERS));

  container.replaceChildren(
    select("Runtime", RUNTIMES.map((m) => [m, `${m} min or less`]), filters.maxRuntime, (v) =>
      set({ maxRuntime: v === null ? null : Number(v) }),
    ),
    select("Genre", options.genres.map((g) => [g, g]), filters.genre, (v) => set({ genre: v })),
    select("Decade", options.decades.map((d) => [d, `${d}s`]), filters.decade, (v) =>
      set({ decade: v === null ? null : Number(v) }),
    ),
    clear,
  );
}
