import test from "node:test";
import assert from "node:assert/strict";
import { providerLine } from "../../site/js/providers.js";

const p = (stream = [], rent = [], buy = []) => ({ stream, rent, buy, link: null });

test("stream wins over rent and buy", () => {
  assert.deepEqual(providerLine(p(["Netflix"], ["Apple TV"], ["Google Play"])), { label: "Stream", names: ["Netflix"] });
});

test("rent when nothing streams", () => {
  assert.deepEqual(providerLine(p([], ["Apple TV"], ["Google Play"])), { label: "Rent", names: ["Apple TV"] });
});

test("buy when only buy", () => {
  assert.deepEqual(providerLine(p([], [], ["Google Play"])), { label: "Buy", names: ["Google Play"] });
});

test("all empty says not listed", () => {
  assert.deepEqual(providerLine(p()), { label: "Not listed in PH", names: [] });
});

test("missing providers gives null", () => {
  assert.equal(providerLine(null), null);
  assert.equal(providerLine(undefined), null);
});
