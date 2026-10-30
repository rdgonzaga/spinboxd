import json

from scraper import build
from scraper.letterboxd import Blocked, Item

CONFIG = {
    "sources": {
        "shared": {"label": "Our list", "url": "u/shared/"},
        "rai": {"label": "Rai", "url": "u/rai/"},
    }
}


def item(slug, year=2000):
    return Item(slug, slug.title(), year, f"https://letterboxd.com/film/{slug}/")


def fake_scrape(results):
    def scrape(url, delay):
        got = results[url]
        if isinstance(got, Exception):
            raise got
        return got

    return scrape


def test_merge_dedupes_and_tags_sources():
    scrape = fake_scrape(
        {
            "u/shared/": [item("heat"), item("alien")],
            "u/rai/": [item("alien"), item("ran")],
        }
    )
    payload = build.run(CONFIG, {}, None, scrape=scrape)

    by_slug = {f["slug"]: f for f in payload["films"]}
    assert sorted(by_slug) == ["alien", "heat", "ran"]
    assert by_slug["alien"]["sources"] == ["shared", "rai"]
    assert by_slug["heat"]["sources"] == ["shared"]
    assert payload["sources"]["shared"]["count"] == 2
    assert payload["sources"]["rai"]["ok"]


def test_films_are_sorted_by_slug():
    scrape = fake_scrape({"u/shared/": [item("zodiac"), item("alien")], "u/rai/": []})
    payload = build.run(CONFIG, {}, None, scrape=scrape)
    assert [f["slug"] for f in payload["films"]] == ["alien", "zodiac"]


def previous_payload():
    scrape = fake_scrape({"u/shared/": [item("heat"), item("alien")], "u/rai/": [item("ran")]})
    return build.run(CONFIG, {}, None, scrape=scrape)


def test_blocked_source_keeps_previous_films():
    prev = previous_payload()
    scrape = fake_scrape({"u/shared/": [item("heat"), item("alien")], "u/rai/": Blocked("x")})

    payload = build.run(CONFIG, prev, None, scrape=scrape)

    assert payload["sources"]["rai"]["ok"] is False
    assert payload["sources"]["rai"]["error"] == "blocked"
    assert payload["sources"]["rai"]["scraped_at"] == prev["sources"]["rai"]["scraped_at"]
    assert "ran" in {f["slug"] for f in payload["films"]}


def test_shrunk_source_is_rejected():
    slugs = ["alien", "brazil", "heat", "ran"]
    prev = build.run(
        CONFIG,
        {},
        None,
        scrape=fake_scrape({"u/shared/": [item(s) for s in slugs], "u/rai/": []}),
    )
    scrape = fake_scrape({"u/shared/": [item("heat")], "u/rai/": []})

    payload = build.run(CONFIG, prev, None, scrape=scrape)

    assert payload["sources"]["shared"]["error"] == "shrunk"
    assert payload["sources"]["shared"]["count"] == 4
    assert {f["slug"] for f in payload["films"]} == set(slugs)


def test_only_refreshes_named_source():
    prev = previous_payload()
    scrape = fake_scrape({"u/shared/": [item("heat"), item("alien"), item("brazil")]})

    payload = build.run(CONFIG, prev, None, only={"shared"}, scrape=scrape)

    assert payload["sources"]["rai"] == prev["sources"]["rai"]
    assert "ran" in {f["slug"] for f in payload["films"]}
    assert "brazil" in {f["slug"] for f in payload["films"]}


def test_unchanged_scrape_leaves_file_alone(tmp_path):
    out = tmp_path / "watchlist.json"
    scrape = fake_scrape({"u/shared/": [item("heat")], "u/rai/": [item("ran")]})

    first = build.run(CONFIG, {}, None, scrape=scrape)
    assert build.write_if_changed(out, first, {})

    saved = json.loads(out.read_text("utf-8"))
    second = build.run(CONFIG, saved, None, scrape=scrape)
    assert not build.write_if_changed(out, second, saved)
    assert json.loads(out.read_text("utf-8")) == saved
