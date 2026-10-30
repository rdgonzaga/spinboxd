import test from "node:test";
import assert from "node:assert/strict";
import { parseCachedSkips, withoutSkipped } from "../../site/js/pool.js";

test("withoutSkipped removes only skipped films and keeps order", () => {
  const films = [{ slug: "a" }, { slug: "b" }, { slug: "c" }];
  assert.deepEqual(withoutSkipped(films, new Set(["b"])).map((f) => f.slug), ["a", "c"]);
  assert.deepEqual(withoutSkipped(films, new Set()).map((f) => f.slug), ["a", "b", "c"]);
  assert.deepEqual(withoutSkipped(films, new Set(["a", "b", "c", "zzz"])), []);
});

test("parseCachedSkips reads a saved array", () => {
  assert.deepEqual([...parseCachedSkips('["a","b"]')], ["a", "b"]);
});

test("parseCachedSkips survives bad input", () => {
  for (const raw of [null, "", "{not json", '{"a":1}', "42", '[1,2]']) {
    assert.equal(parseCachedSkips(raw).size, 0, String(raw));
  }
});
