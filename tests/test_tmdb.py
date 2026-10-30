import json

from scraper.tmdb import Tmdb

DETAILS = {
    666277: {
        "poster_path": "/p.jpg",
        "backdrop_path": "/b.jpg",
        "runtime": 106,
        "genres": [{"id": 18, "name": "Drama"}, {"id": 10749, "name": "Romance"}],
    },
    1: {"poster_path": None, "backdrop_path": None, "runtime": 0, "genres": []},
}


def make(tmp_path, overrides=None, key="k" * 32):
    ov = None
    if overrides:
        ov = tmp_path / "ov.toml"
        ov.write_text("[overrides]\n" + "".join(f'"{k}" = {v}\n' for k, v in overrides.items()))
    t = Tmdb(key, tmp_path / "cache.json", ov)
    t.calls = []

    def fake_get(path, **params):
        t.calls.append((path, params))
        if path == "/search/movie":
            if "year" in params:
                empty = params["query"] in ("Heat", "Nothing")
                return {"results": []} if empty else {"results": [{"id": 666277}]}
            return {"results": [{"id": 666277}]} if params["query"] != "Nothing" else {"results": []}
        return DETAILS[int(path.rsplit("/", 1)[1])]

    t._get = fake_get
    return t


def test_lookup_builds_image_urls_and_saves_cache(tmp_path):
    t = make(tmp_path)
    info = t.lookup("past-lives", "Past Lives", 2023)
    t.save()

    assert info["poster"] == "https://image.tmdb.org/t/p/w342/p.jpg"
    assert info["backdrop"] == "https://image.tmdb.org/t/p/w780/b.jpg"
    assert info["runtime"] == 106
    assert info["genres"] == ["Drama", "Romance"]
    assert json.loads((tmp_path / "cache.json").read_text())["past-lives"]["tmdb_id"] == 666277


def test_cached_film_makes_no_requests(tmp_path):
    t = make(tmp_path)
    t.lookup("past-lives", "Past Lives", 2023)
    t.calls.clear()

    t.lookup("past-lives", "Past Lives", 2023)

    assert t.calls == []


def test_search_retries_without_year(tmp_path):
    t = make(tmp_path)
    t.lookup("heat", "Heat", 1995)

    searches = [p for path, p in t.calls if path == "/search/movie"]
    assert "year" in searches[0] and "year" not in searches[1]


def test_no_match_returns_none_and_is_not_cached(tmp_path):
    t = make(tmp_path)
    assert t.lookup("nothing", "Nothing", 2000) is None
    assert "nothing" not in t.cache


def test_override_wins_over_search(tmp_path):
    t = make(tmp_path, overrides={"heat": 1})
    info = t.lookup("heat", "Heat", 1995)

    assert info["tmdb_id"] == 1
    assert info["poster"] is None and info["runtime"] is None
    assert not any(path == "/search/movie" for path, _ in t.calls)


def test_without_key_only_cache_is_used(tmp_path):
    seeded = make(tmp_path)
    seeded.lookup("past-lives", "Past Lives", 2023)
    seeded.save()

    t = Tmdb(None, tmp_path / "cache.json")
    assert t.lookup("past-lives", "Past Lives", 2023)["tmdb_id"] == 666277
    assert t.lookup("unknown", "Unknown", 2000) is None


def test_key_style_picks_auth_method(tmp_path):
    v3 = Tmdb("a" * 32, tmp_path / "c.json")
    v4 = Tmdb("e" * 200, tmp_path / "c.json")
    assert v3.params == {"api_key": "a" * 32} and "Authorization" not in v3.session.headers
    assert v4.params == {} and v4.session.headers["Authorization"].startswith("Bearer ")
