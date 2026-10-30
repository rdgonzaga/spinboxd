import argparse
import json
import os
import sys
import tomllib
from pathlib import Path

from . import build
from .tmdb import Tmdb

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "data" / "watchlist.json"


def main():
    ap = argparse.ArgumentParser(prog="scraper")
    ap.add_argument("--config", default=ROOT / "config.toml")
    ap.add_argument("--source", action="append", help="only refresh this source (repeatable)")
    ap.add_argument("--no-tmdb", action="store_true", help="reuse cached TMDB data, no API calls")
    args = ap.parse_args()

    with open(args.config, "rb") as f:
        config = tomllib.load(f)
    previous = json.loads(OUT.read_text("utf-8")) if OUT.exists() else {}

    key = None if args.no_tmdb else os.environ.get("TMDB_API_KEY")
    if not key and not args.no_tmdb:
        print("TMDB_API_KEY not set, using cached TMDB data only")
    tmdb = Tmdb(key, ROOT / "data" / "tmdb_cache.json", ROOT / "data" / "tmdb_overrides.toml")

    payload = build.run(config, previous, tmdb, only=set(args.source or []))
    build.write_if_changed(OUT, payload, previous)

    main_source = payload["sources"].get(config["default_source"], {})
    if not main_source.get("ok"):
        print(f"main source '{config['default_source']}' failed", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
