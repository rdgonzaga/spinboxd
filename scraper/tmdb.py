import json
import time
import tomllib
from pathlib import Path

import requests

API = "https://api.themoviedb.org/3"
IMG = "https://image.tmdb.org/t/p"
FIELDS = ("tmdb_id", "poster", "backdrop", "runtime", "genres")


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
        if year:
            hits = self._get("/search/movie", query=title, year=year).get("results")
            if hits:
                return hits[0]["id"]
        hits = self._get("/search/movie", query=title).get("results")
        return hits[0]["id"] if hits else None

    def _details(self, tmdb_id):
        d = self._get(f"/movie/{tmdb_id}")
        return {
            "tmdb_id": tmdb_id,
            "poster": f"{IMG}/w342{d['poster_path']}" if d.get("poster_path") else None,
            "backdrop": f"{IMG}/w780{d['backdrop_path']}" if d.get("backdrop_path") else None,
            "runtime": d.get("runtime") or None,
            "genres": [g["name"] for g in d.get("genres", [])],
        }

    def lookup(self, slug, title, year):
        override = self.overrides.get(slug)
        cached = self.cache.get(slug)
        if cached and (not override or cached.get("tmdb_id") == override):
            return cached
        if not self.enabled:
            return cached

        try:
            tmdb_id = override or self._search(title, year)
            if not tmdb_id:
                return None
            found = self._details(tmdb_id)
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
