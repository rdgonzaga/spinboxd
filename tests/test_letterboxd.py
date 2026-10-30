from pathlib import Path

import pytest

from scraper import letterboxd
from scraper.letterboxd import MarkupChanged, parse_page, split_title

FIXTURES = Path(__file__).parent / "fixtures"


def html(name):
    return (FIXTURES / f"{name}.html").read_text("utf-8")


def test_shared_list_is_one_page():
    items, has_next = parse_page(html("shared_p1"))
    assert len(items) == 30
    assert not has_next
    first = items[0]
    assert (first.slug, first.title, first.year) == ("parasite-2019", "Parasite", 2019)
    assert first.url == "https://letterboxd.com/film/parasite-2019/"


def test_watchlist_first_page_has_next():
    items, has_next = parse_page(html("rai_p1"))
    assert len(items) == 28
    assert has_next


def test_watchlist_last_page_has_no_next():
    items, has_next = parse_page(html("rai_p7"))
    assert len(items) == 10
    assert not has_next


def test_small_watchlist():
    items, _ = parse_page(html("julia_p1"))
    assert len(items) == 6


def test_legacy_markup():
    page = """
    <ul class="poster-list">
      <li class="poster-container">
        <div class="film-poster" data-film-slug="heat-1995"><img alt="Heat"></div>
      </li>
    </ul>"""
    items, has_next = parse_page(page)
    assert [(i.slug, i.title, i.year) for i in items] == [("heat-1995", "Heat", None)]
    assert not has_next


def test_page_without_list_raises():
    with pytest.raises(MarkupChanged):
        parse_page("<html><body><h1>Just a moment...</h1></body></html>")


def test_list_without_films_raises():
    with pytest.raises(MarkupChanged):
        parse_page('<ul class="poster-list"><li class="something-new"></li></ul>')


@pytest.mark.parametrize(
    "name, expected",
    [
        ("Parasite (2019)", ("Parasite", 2019)),
        ("2001: A Space Odyssey (1968)", ("2001: A Space Odyssey", 1968)),
        ("Blade Runner 2049 (2017)", ("Blade Runner 2049", 2017)),
        ("Untitled", ("Untitled", None)),
    ],
)
def test_split_title(name, expected):
    assert split_title(name) == expected


class FakeResponse:
    def __init__(self, text, status=200):
        self.text = text
        self.status_code = status
        self.headers = {}


class FakeSession:
    def __init__(self, pages):
        self.pages = pages
        self.headers = {}
        self.requested = []

    def get(self, url, timeout=None):
        self.requested.append(url)
        return FakeResponse(self.pages[url])


def test_scrape_walks_every_page(monkeypatch):
    monkeypatch.setattr(letterboxd.time, "sleep", lambda s: None)
    base = "https://letterboxd.com/rdgonzaga/watchlist/"
    session = FakeSession({base: html("rai_p1"), base + "page/2/": html("rai_p7")})

    items = letterboxd.scrape(base, session=session)

    assert session.requested == [base, base + "page/2/"]
    assert len(items) == 38


def test_scrape_stops_at_page_cap(monkeypatch):
    monkeypatch.setattr(letterboxd.time, "sleep", lambda s: None)
    monkeypatch.setattr(letterboxd, "MAX_PAGES", 3)
    base = "https://letterboxd.com/x/watchlist/"
    pages = {base: html("rai_p1")}
    pages.update({f"{base}page/{n}/": html("rai_p1") for n in range(2, 5)})
    session = FakeSession(pages)

    letterboxd.scrape(base, session=session)

    assert len(session.requested) == 3
