import json
from datetime import datetime, timezone
from pathlib import Path

from . import letterboxd
from .tmdb import FIELDS

SHRINK_LIMIT = 0.5
FAILURES = (letterboxd.Blocked, letterboxd.MarkupChanged, letterboxd.FetchFailed)


def _now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _stable(payload):
    """Payload minus timestamps, so an unchanged scrape doesn't rewrite the file."""
    sources = {
        k: {f: v for f, v in s.items() if f != "scraped_at"} for k, s in payload["sources"].items()
    }
    return {"sources": sources, "films": payload["films"]}


def _carry(previous, key, label, url, error=None):
    old = previous.get("sources", {}).get(key, {})
    films = [f for f in previous.get("films", []) if key in f["sources"]]
    meta = {"label": label, "url": url, "count": len(films), "ok": error is None}
    if error:
        meta["error"] = error
    meta["scraped_at"] = old.get("scraped_at")
    return films, meta


def run(config, previous, tmdb, only=None, scrape=letterboxd.scrape):
    """Scrape the configured sources and return the new payload."""
    delay = config.get("delay_seconds", 3)
    sources, by_slug = {}, {}

    for key, src in config["sources"].items():
        label, url = src["label"], src["url"]

        if only and key not in only:
            old_films, meta = _carry(previous, key, label, url)
            old_meta = previous.get("sources", {}).get(key)
            sources[key] = old_meta or meta
            for f in old_films:
                by_slug.setdefault(f["slug"], f)
            continue

        print(f"{key}: scraping {url}", flush=True)
        try:
            items = scrape(url, delay)
        except FAILURES as e:
            error = "blocked" if isinstance(e, letterboxd.Blocked) else e.__class__.__name__
            print(f"{key}: failed ({error}), keeping previous data")
            old_films, sources[key] = _carry(previous, key, label, url, error)
            for f in old_films:
                by_slug.setdefault(f["slug"], f)
            continue

        before = previous.get("sources", {}).get(key, {}).get("count", 0)
        if before and len(items) < before * SHRINK_LIMIT:
            print(f"{key}: {before} -> {len(items)} films, looks like a parse problem")
            old_films, sources[key] = _carry(previous, key, label, url, "shrunk")
            for f in old_films:
                by_slug.setdefault(f["slug"], f)
            continue

        sources[key] = {
            "label": label,
            "url": url,
            "count": len(items),
            "ok": True,
            "scraped_at": _now(),
        }
        for it in items:
            film = by_slug.setdefault(
                it.slug,
                {"slug": it.slug, "title": it.title, "year": it.year, "url": it.url, "sources": []},
            )
            if key not in film["sources"]:
                film["sources"].append(key)

    # a film kept from an earlier run may also be live in another source
    for film in by_slug.values():
        film["sources"] = [k for k in sources if k in film["sources"]]

    for film in by_slug.values():
        info = tmdb.lookup(film["slug"], film["title"], film["year"]) if tmdb else None
        for field in FIELDS:
            film[field] = info.get(field) if info else None
    if tmdb:
        tmdb.save()

    return {
        "generated_at": _now(),
        "sources": sources,
        "films": sorted(by_slug.values(), key=lambda f: f["slug"]),
    }


def write_if_changed(path, payload, previous):
    path = Path(path)
    if previous and _stable(previous) == _stable(payload):
        print("no changes")
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", "utf-8")
    print(f"wrote {path} ({len(payload['films'])} films)")
    return True
