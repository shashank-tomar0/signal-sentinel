// test/diff.test.js — unit tests for the semantic diff + classifier.
// These are offline-safe (no network) so the suite runs anywhere.
import { test } from "node:test";
import assert from "node:assert/strict";
import { diffRows, classify } from "../src/diff.js";

const PRICING = [
  { tier: "Free", price: 0, trial: null },
  { tier: "Pro", price: 29, trial: "14d" },
  { tier: "Business", price: 99, trial: "14d" },
];

test("no change → clean", () => {
  const r = diffRows(PRICING, PRICING, { keyField: "tier" });
  assert.equal(r.changed, false);
  assert.equal(r.added.length, 0);
  assert.equal(r.removed.length, 0);
  assert.equal(r.modified.length, 0);
});

test("detects added tier (structural change)", () => {
  const current = [...PRICING, { tier: "Enterprise", price: 299, trial: null }];
  const r = diffRows(PRICING, current, { keyField: "tier" });
  assert.equal(r.changed, true);
  assert.deepEqual(r.added.map((a) => a.key), ["Enterprise"]);
  const signal = classify(r);
  assert.equal(signal.severity, "critical");
});

test("detects removed tier", () => {
  const current = PRICING.filter((p) => p.tier !== "Pro");
  const r = diffRows(PRICING, current, { keyField: "tier" });
  assert.equal(r.removed.length, 1);
  assert.equal(classify(r).severity, "major");
});

test("detects price change with big move → critical", () => {
  const current = PRICING.map((p) => (p.tier === "Pro" ? { ...p, price: 49 } : p));
  const r = diffRows(PRICING, current, { keyField: "tier", numericTolerance: 0 });
  assert.equal(r.modified.length, 1);
  assert.equal(classify(r).severity, "critical");
});

test("numeric tolerance suppresses tiny jitter", () => {
  const current = PRICING.map((p) =>
    p.tier === "Pro" ? { ...p, price: 29.01 } : p,
  );
  const r = diffRows(PRICING, current, { keyField: "tier", numericTolerance: 0.5 });
  assert.equal(r.changed, false, "sub-0.5% price change should be noise");
});

test("watchFields restricts what is diffed", () => {
  const current = PRICING.map((p) => (p.tier === "Pro" ? { ...p, fromExtra: "x" } : p));
  const r = diffRows(PRICING, current, { keyField: "tier", watchFields: ["price"] });
  assert.equal(r.changed, false);
});

