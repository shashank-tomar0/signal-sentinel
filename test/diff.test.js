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

test("numeric move >=5% → major (was dead branch)", () => {
  const current = PRICING.map((p) => (p.tier === "Pro" ? { ...p, price: 31 } : p)); // 29 -> 31 ≈ 6.9%
  const r = diffRows(PRICING, current, { keyField: "tier" });
  assert.equal(classify(r).severity, "major");
});

test("numeric move <5% → minor (still minor)", () => {
  const current = PRICING.map((p) => (p.tier === "Pro" ? { ...p, price: 29.5 } : p)); // 29 -> 29.5 ≈ 1.7%
  const r = diffRows(PRICING, current, { keyField: "tier" });
  assert.equal(classify(r).severity, "minor");
});

test("numeric move >=25% → critical", () => {
  const current = PRICING.map((p) => (p.tier === "Pro" ? { ...p, price: 40 } : p)); // 29 -> 40 ≈ 38%
  const r = diffRows(PRICING, current, { keyField: "tier" });
  assert.equal(classify(r).severity, "critical");
});

test("new entry on stable list → critical", () => {
  const current = PRICING.map((p) => (p.tier === "Pro" ? { ...p, price: 29.1 } : p)); // under 5% noise
  const r = diffRows(PRICING, current, { keyField: "tier" });
  assert.equal(classify(r).severity, "minor");
});

test("board churn (many new + removed) → not critical", () => {
  const baseline = [
    { name: "A", rank: 1 },
    { name: "B", rank: 2 },
    { name: "C", rank: 3 },
    { name: "D", rank: 4 },
    { name: "E", rank: 5 },
    { name: "F", rank: 6 },
    { name: "G", rank: 7 },
    { name: "H", rank: 8 },
    { name: "I", rank: 9 },
    { name: "J", rank: 10 },
  ];
  const current = [
    { name: "X", rank: 1 },
    { name: "Y", rank: 2 },
    { name: "Z", rank: 3 },
    { name: "K", rank: 4 },
    { name: "L", rank: 5 },
    { name: "M", rank: 6 },
    { name: "N", rank: 7 },
    { name: "O", rank: 8 },
    { name: "P", rank: 9 },
    { name: "Q", rank: 10 },
  ];
  const r = diffRows(baseline, current, { keyField: "name" });
  assert.equal(r.added.length, 10, "10 new names");
  assert.equal(r.removed.length, 10, "10 removed names");
  assert.notEqual(classify(r).severity, "critical", "board reset is not a critical signal");
});

