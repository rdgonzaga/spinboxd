import test from "node:test";
import assert from "node:assert/strict";
import { decadeOf, filterOptions, matches, sortFilms, visibleFilms } from "../../site/js/pool.js";

const film = (slug, o = {}) => ({ slug, year: 1999, runtime: 100, genres: ["Drama"], sources: ["shared"], ...o });
const NONE = { maxRuntime: null, genre: null, decade: null, service: null };

test("decadeOf", () => {
  assert.equal(decadeOf(1994), 1990);
  assert.equal(decadeOf(2000), 2000);
  assert.equal(decadeOf(null), null);
});

test("runtime cap keeps shorter films and films with unknown runtime", () => {
  const f = { ...NONE, maxRuntime: 120 };
  assert.equal(matches(film("a", { runtime: 120 }), f), true);
  assert.equal(matches(film("a", { runtime: 121 }), f), false);
  assert.equal(matches(film("a", { runtime: null }), f), true);
});

test("genre filter", () => {
  const f = { ...NONE, genre: "Comedy" };
  assert.equal(matches(film("a", { genres: ["Comedy", "Drama"] }), f), true);
  assert.equal(matches(film("a", { genres: ["Drama"] }), f), false);
  assert.equal(matches(film("a", { genres: null }), f), false);
});

test("decade filter, unknown year fails", () => {
  const f = { ...NONE, decade: 1990 };
  assert.equal(matches(film("a", { year: 1994 }), f), true);
  assert.equal(matches(film("a", { year: 2001 }), f), false);
  assert.equal(matches(film("a", { year: null }), f), false);
});

test("no filters matches everything", () => {
  assert.equal(matches(film("a", { runtime: null, year: null, genres: null }), NONE), true);
});

test("filterOptions are sorted and de-duplicated", () => {
  const films = [
    film("a", { genres: ["Drama", "Comedy"], year: 2005 }),
    film("b", { genres: ["Comedy"], year: 1994 }),
    film("c", { genres: null, year: null, providers: { stream: ["Netflix", "HBO Max"] } }),
    film("d", { providers: { stream: ["Netflix"] } }),
  ];
  assert.deepEqual(filterOptions(films), {
    genres: ["Comedy", "Drama"],
    decades: [1990, 2000],
    services: ["HBO Max", "Netflix"],
  });
});

test("service filter matches streaming providers only", () => {
  const f = { ...NONE, service: "Netflix" };
  assert.equal(matches(film("a", { providers: { stream: ["Netflix"] } }), f), true);
  assert.equal(matches(film("b", { providers: { stream: [], rent: ["Netflix"] } }), f), false);
  assert.equal(matches(film("c"), f), false);
});

test("sortFilms keeps list order for ties and puts missing values last", () => {
  const films = [
    film("a", { rating: null, runtime: null, year: null }),
    film("b", { rating: 6, runtime: 120, year: 1990 }),
    film("c", { rating: 8, runtime: 90, year: 2010 }),
    film("d", { rating: 8, runtime: 90, year: 2010 }),
  ];
  const slugs = (key) => sortFilms(films, key).map((x) => x.slug).join("");
  assert.equal(slugs("list"), "abcd");
  assert.equal(slugs("rating"), "cdba");
  assert.equal(slugs("runtime"), "cdba");
  assert.equal(slugs("year"), "cdba");
});

test("visibleFilms applies source then filters; zero matches is empty", () => {
  const data = {
    films: [
      film("a", { sources: ["shared"], runtime: 90 }),
      film("b", { sources: ["rai"], runtime: 90 }),
      film("c", { sources: ["shared"], runtime: 150 }),
    ],
  };
  assert.deepEqual(visibleFilms(data, "shared", { ...NONE, maxRuntime: 120 }).map((f) => f.slug), ["a"]);
  assert.deepEqual(visibleFilms(data, "all", NONE).map((f) => f.slug), ["a", "b", "c"]);
  assert.deepEqual(visibleFilms(data, "shared", { ...NONE, genre: "Horror" }), []);
});
