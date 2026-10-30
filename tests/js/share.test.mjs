import test from "node:test";
import assert from "node:assert/strict";
import { parsePickHash, pickHash } from "../../site/js/share.js";

test("pickHash and parsePickHash round trip", () => {
  for (const slug of ["heat", "10-things-i-hate-about-you", "weird slug&=#?", "é"]) {
    assert.equal(parsePickHash(pickHash(slug)), slug);
  }
});

test("pickHash format", () => {
  assert.equal(pickHash("heat"), "#pick=heat");
});

test("parsePickHash ignores anything else", () => {
  for (const h of ["", "#", "#other=1", "#pick=", "pick=heat", "#pick=%E0%A4%A"]) {
    assert.equal(parsePickHash(h), null, h);
  }
});
