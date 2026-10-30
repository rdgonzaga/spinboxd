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
  for (const f of films) {
    for (const g of f.genres || []) genres.add(g);
    const d = decadeOf(f.year);
    if (d !== null) decades.add(d);
  }
  return { genres: [...genres].sort(), decades: [...decades].sort((a, b) => a - b) };
}

// a film with no runtime passes a runtime cap so it never vanishes silently
export function matches(film, { maxRuntime, genre, decade }) {
  if (maxRuntime && film.runtime && film.runtime > maxRuntime) return false;
  if (genre && !(film.genres || []).includes(genre)) return false;
  if (decade && decadeOf(film.year) !== decade) return false;
  return true;
}

export function visibleFilms(data, source, filters) {
  return poolFor(data, source).filter((f) => matches(f, filters));
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
