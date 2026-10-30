export async function loadWatchlist() {
  const res = await fetch("data/watchlist.json", { cache: "no-cache" });
  if (!res.ok) throw new Error(`watchlist.json returned ${res.status}`);
  return res.json();
}
