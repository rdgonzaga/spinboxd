export function poolFor(data, source) {
  if (source === "all") return data.films;
  return data.films.filter((f) => f.sources.includes(source));
}

export function decadeOf(year) {
  return year ? Math.floor(year / 10) * 10 : null;
}

export function filterOptions(films) {
  const genres = new Set();
  const decades = new Set();
  const services = new Set();
  for (const f of films) {
    for (const g of f.genres || []) genres.add(g);
    for (const p of f.providers?.stream || []) services.add(p);
    const d = decadeOf(f.year);
    if (d !== null) decades.add(d);
  }
  return {
    genres: [...genres].sort(),
    decades: [...decades].sort((a, b) => a - b),
    services: [...services].sort(),
  };
}

// a film with no runtime passes a runtime cap so it never vanishes silently
export function matches(film, { maxRuntime, genre, decade, service }) {
  if (maxRuntime && film.runtime && film.runtime > maxRuntime) return false;
  if (genre && !(film.genres || []).includes(genre)) return false;
  if (decade && decadeOf(film.year) !== decade) return false;
  if (service && !(film.providers?.stream || []).includes(service)) return false;
  return true;
}

export function applyFilters(films, filters) {
  return films.filter((f) => matches(f, filters));
}

// missing values sort last either way; list order is the incoming order
export const SORTS = {
  list: "List order",
  rating: "Rating",
  runtime: "Shortest",
  year: "Newest",
};

export function sortFilms(films, key) {
  const by = {
    rating: (f) => -(f.rating ?? -1),
    runtime: (f) => f.runtime || Infinity,
    year: (f) => -(f.year || -1),
  }[key];
  if (!by) return films;
  const out = [...films];
  // stable: ties and missing values keep list order
  return out.map((f, i) => [f, i]).sort((a, b) => by(a[0]) - by(b[0]) || a[1] - b[1]).map(([f]) => f);
}

export function visibleFilms(data, source, filters) {
  return applyFilters(poolFor(data, source), filters);
}

export function withoutSkipped(films, skipped) {
  return films.filter((f) => !skipped.has(f.slug));
}

export function parseCachedSkips(raw) {
  try {
    const list = JSON.parse(raw);
    return new Set(Array.isArray(list) ? list.filter((s) => typeof s === "string") : []);
  } catch {
    return new Set();
  }
}

// rejection sampling so the modulo doesn't favour low indexes
export function randomInt(n) {
  const limit = Math.floor(2 ** 32 / n) * n;
  const buf = new Uint32Array(1);
  do {
    crypto.getRandomValues(buf);
  } while (buf[0] >= limit);
  return buf[0] % n;
}
