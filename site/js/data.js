export async function loadWatchlist() {
  // index.html starts this request early; fall back to a fresh one if it didn't
  const res = await (window.watchlistRequest || fetch("data/watchlist.json", { cache: "no-cache" }));
  if (!res.ok) throw new Error(`watchlist.json returned ${res.status}`);
  return res.json();
}
