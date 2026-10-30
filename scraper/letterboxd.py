import random
import re
import time
from dataclasses import dataclass

import requests
from bs4 import BeautifulSoup

BASE = "https://letterboxd.com"
MAX_PAGES = 50
BACKOFF = (5, 15, 45)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

TITLE_YEAR = re.compile(r"^(.*?)\s*\((\d{4})\)$")


class Blocked(Exception):
    pass


class MarkupChanged(Exception):
    pass


class FetchFailed(Exception):
    pass


@dataclass(frozen=True)
class Item:
    slug: str
    title: str
    year: int | None
    url: str


def split_title(name):
    m = TITLE_YEAR.match(name.strip())
    if m:
        return m.group(1), int(m.group(2))
    return name.strip(), None


def _item_from_current(el):
    link = el.get("data-item-link") or ""
    slug = el.get("data-item-slug") or link.strip("/").rsplit("/", 1)[-1]
    name = el.get("data-item-name") or ""
    if not slug or not name:
        return None
    title, year = split_title(name)
    return Item(slug, title, year, f"{BASE}/film/{slug}/")


def _item_from_legacy(el):
    slug = el.get("data-film-slug") or ""
    img = el.find("img")
    name = (img.get("alt") if img else "") or ""
    if not slug or not name:
        return None
    return Item(slug, name.strip(), None, f"{BASE}/film/{slug}/")


def parse_page(html):
    """Return (items, has_next) for one list or watchlist page."""
    soup = BeautifulSoup(html, "html.parser")
    if not soup.select_one("ul.poster-list, div.poster-grid ul.grid"):
        raise MarkupChanged("no poster list on page")

    items = [
        _item_from_current(el)
        for el in soup.select('div[data-component-class="LazyPoster"]')
    ]
    if not any(items):
        items = [
            _item_from_legacy(el) for el in soup.select("li.poster-container div.film-poster")
        ]
    items = [i for i in items if i]
    if not items:
        raise MarkupChanged("poster list has no recognizable films")

    return items, soup.select_one("a.next") is not None


def _looks_like_challenge(text):
    low = text.lower()
    return "just a moment" in low or "cf-chl" in low or "cf-browser-verification" in low


def fetch(session, url):
    blocked_once = False
    attempt = 0
    while attempt < len(BACKOFF):
        try:
            r = session.get(url, timeout=20)
        except requests.RequestException:
            r = None

        if r is not None:
            if r.status_code == 200:
                return r.text
            if r.status_code == 404:
                raise FetchFailed(f"404 for {url}")
            if r.status_code == 403 or (r.status_code == 503 and _looks_like_challenge(r.text)):
                if blocked_once:
                    raise Blocked(url)
                blocked_once = True
                time.sleep(60)
                continue
            if r.status_code == 429:
                retry_after = r.headers.get("Retry-After", "")
                if retry_after.isdigit():
                    time.sleep(min(int(retry_after), 120))

        time.sleep(BACKOFF[attempt])
        attempt += 1

    raise FetchFailed(f"gave up on {url}")


def scrape(url, delay=3.0, session=None):
    if not url.endswith("/"):
        url += "/"
    session = session or requests.Session()
    session.headers.update(HEADERS)

    seen = {}
    for page in range(1, MAX_PAGES + 1):
        page_url = url if page == 1 else f"{url}page/{page}/"
        items, has_next = parse_page(fetch(session, page_url))
        print(f"  page {page}: {len(items)} films", flush=True)
        for item in items:
            seen.setdefault(item.slug, item)
        if not has_next:
            break
        time.sleep(delay + random.uniform(0, 1.5))
    return list(seen.values())
