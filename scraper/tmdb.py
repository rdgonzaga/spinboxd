import json
import time
import tomllib
from pathlib import Path

import requests

API = "https://api.themoviedb.org/3"
IMG = "https://image.tmdb.org/t/p"
REGION = "PH"
FIELDS = ("tmdb_id", "kind", "poster", "backdrop", "runtime", "genres", "overview", "rating", "providers")


def _parse_override(value):
    """An override is a movie id, or "tv/<id>" for a series."""
    if isinstance(value, str) and value.startswith("tv/"):
        return "tv", int(value[3:])
    return "movie", int(value)


class Tmdb:
    """Looks films up on TMDB and remembers the answers per Letterboxd slug."""

    def __init__(self, key, cache_path, overrides_path=None):
        self.cache_path = Path(cache_path)
        self.cache = json.loads(self.cache_path.read_text("utf-8")) if self.cache_path.exists() else {}
        self.looked_up = 0
        self.overrides = {}
        if overrides_path and Path(overrides_path).exists():
            with open(overrides_path, "rb") as f:
                self.overrides = tomllib.load(f).get("overrides", {})

        self.session = requests.Session()
        self.params = {}
        if key:
            # v4 read tokens are JWTs, v3 keys are 32 hex chars
            if len(key) > 40:
                self.session.headers["Authorization"] = f"Bearer {key}"
            else:
                self.params["api_key"] = key
        self.enabled = bool(key)

    def _get(self, path, **params):
        r = self.session.get(f"{API}{path}", params={**self.params, **params}, timeout=15)
        r.raise_for_status()
        return r.json()

    def _search(self, title, year):
        # Letterboxd lists some series too, so a title with no film match is tried as tv
        for kind, year_param in (("movie", "year"), ("tv", "first_air_date_year")):
            if year:
                hits = self._get(f"/search/{kind}", query=title, **{year_param: year}).get("results")
                if hits:
                    return kind, hits[0]["id"]
            hits = self._get(f"/search/{kind}", query=title).get("results")
            if hits:
                return kind, hits[0]["id"]
        return None

    @staticmethod
    def _providers(raw):
        entry = (raw.get("watch/providers") or {}).get("results", {}).get(REGION) or {}
        names = lambda kind: sorted(p["provider_name"] for p in entry.get(kind, []))
        logos = {
            p["provider_name"]: f"{IMG}/w92{p['logo_path']}"
            for kind in ("flatrate", "rent", "buy")
            for p in entry.get(kind, [])
            if p.get("logo_path")
        }
        return {
            "stream": names("flatrate"),
            "rent": names("rent"),
            "buy": names("buy"),
            "logos": dict(sorted(logos.items())),
            "link": entry.get("link"),
        }

    @staticmethod
    def _runtime(d, kind):
        if kind == "movie":
            return d.get("runtime") or None
        # series give per-episode runtimes, and newer ones leave the list empty
        runs = d.get("episode_run_time") or []
        last = d.get("last_episode_to_air") or {}
        return (runs[0] if runs else last.get("runtime")) or None

    def _details(self, kind, tmdb_id):
        d = self._get(f"/{kind}/{tmdb_id}", append_to_response="watch/providers")
        return {
            "tmdb_id": tmdb_id,
            "kind": kind,
            "poster": f"{IMG}/w342{d['poster_path']}" if d.get("poster_path") else None,
            "backdrop": f"{IMG}/w780{d['backdrop_path']}" if d.get("backdrop_path") else None,
            "runtime": self._runtime(d, kind),
            "genres": [g["name"] for g in d.get("genres", [])],
            "overview": d.get("overview") or None,
            "rating": round(d["vote_average"], 1) if d.get("vote_count") else None,
            "providers": self._providers(d),
        }

    def lookup(self, slug, title, year):
        override = _parse_override(self.overrides[slug]) if slug in self.overrides else None
        cached = self.cache.get(slug)
        if not self.enabled:
            return cached

        # streaming data goes stale, so a known film still gets its details refreshed;
        # caches from before series support have no kind, and those were all movies
        known = (cached.get("kind") or "movie", cached["tmdb_id"]) if cached and cached.get("tmdb_id") else None
        if override and known != override:
            known = None
        try:
            match = known or override or self._search(title, year)
            if not match:
                return None
            found = self._details(*match)
        except requests.RequestException as e:
            print(f"tmdb: {slug}: {e.__class__.__name__}")
            return cached
        self.cache[slug] = found
        self.looked_up += 1
        if self.looked_up % 25 == 0:
            print(f"tmdb: {self.looked_up} films looked up", flush=True)
        time.sleep(0.1)
        return found

    def save(self):
        self.cache_path.parent.mkdir(parents=True, exist_ok=True)
        ordered = dict(sorted(self.cache.items()))
        self.cache_path.write_text(json.dumps(ordered, indent=2, ensure_ascii=False) + "\n", "utf-8")
