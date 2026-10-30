import json

from scraper.tmdb import Tmdb

DETAILS = {
    666277: {
        "poster_path": "/p.jpg",
        "backdrop_path": "/b.jpg",
        "runtime": 106,
        "genres": [{"id": 18, "name": "Drama"}, {"id": 10749, "name": "Romance"}],
        "overview": "Two childhood friends meet again.",
        "vote_average": 7.84,
        "vote_count": 1200,
        "watch/providers": {
            "results": {
                "PH": {
                    "link": "https://www.themoviedb.org/movie/666277/watch?locale=PH",
                    "flatrate": [{"provider_name": "Netflix", "logo_path": "/nf.jpg"}],
                    "rent": [{"provider_name": "Google Play"}, {"provider_name": "Apple TV", "logo_path": "/atv.jpg"}],
                }
            }
        },
    },
    1: {
        "poster_path": None,
        "backdrop_path": None,
        "runtime": 0,
        "genres": [],
        "overview": "",
        "vote_average": 0,
        "vote_count": 0,
        "watch/providers": {"results": {}},
    },
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


def test_lookup_includes_overview_rating_providers(tmp_path):
    info = make(tmp_path).lookup("past-lives", "Past Lives", 2023)

    assert info["overview"] == "Two childhood friends meet again."
    assert info["rating"] == 7.8
    assert info["providers"] == {
        "stream": ["Netflix"],
        "rent": ["Apple TV", "Google Play"],
        "buy": [],
        "logos": {
            "Apple TV": "https://image.tmdb.org/t/p/w92/atv.jpg",
            "Netflix": "https://image.tmdb.org/t/p/w92/nf.jpg",
        },
        "link": "https://www.themoviedb.org/movie/666277/watch?locale=PH",
    }


def test_no_votes_or_providers_gives_empty_values(tmp_path):
    info = make(tmp_path, overrides={"heat": 1}).lookup("heat", "Heat", 1995)

    assert info["rating"] is None
    assert info["overview"] is None
    assert info["providers"] == {"stream": [], "rent": [], "buy": [], "logos": {}, "link": None}


def test_cached_film_refreshes_details_but_not_search(tmp_path):
    t = make(tmp_path)
    t.lookup("past-lives", "Past Lives", 2023)
    t.calls.clear()

    t.lookup("past-lives", "Past Lives", 2023)

    assert [path for path, _ in t.calls] == ["/movie/666277"]


def test_cache_without_new_fields_is_upgraded(tmp_path):
    (tmp_path / "cache.json").write_text(
        json.dumps({"past-lives": {"tmdb_id": 666277, "poster": "x", "backdrop": None, "runtime": 1, "genres": []}})
    )
    t = make(tmp_path)

    assert t.lookup("past-lives", "Past Lives", 2023)["overview"] == "Two childhood friends meet again."


def test_old_cache_without_key_is_returned_unchanged(tmp_path):
    old = {"tmdb_id": 666277, "poster": "x", "backdrop": None, "runtime": 1, "genres": []}
    (tmp_path / "cache.json").write_text(json.dumps({"past-lives": old}))

    assert Tmdb(None, tmp_path / "cache.json").lookup("past-lives", "Past Lives", 2023) == old


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
