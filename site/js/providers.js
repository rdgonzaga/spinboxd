const KINDS = [
  ["stream", "Stream"],
  ["rent", "Rent"],
  ["buy", "Buy"],
];

// first kind with any providers wins; null means we have no TMDB data for the film
export function providerLine(providers) {
  if (!providers) return null;
  for (const [key, label] of KINDS) {
    if (providers[key]?.length) return { label, names: providers[key] };
  }
  return { label: "Not listed in PH", names: [] };
}
