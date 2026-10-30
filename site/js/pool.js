export function poolFor(data, source) {
  if (source === "all") return data.films;
  return data.films.filter((f) => f.sources.includes(source));
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
