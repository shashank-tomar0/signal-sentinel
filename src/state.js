// state.js — the versioned memory of every target.
// Each target gets:
//   state/<target>/baseline.json   – the last known-good snapshot (git-committed)
//   state/<target>/history.jsonl   – append-only log of every run (signal provenance)
//
// This is the "compounding asset": baselines are diffable, history proves
// signals over time, and both live in git so the demo can show versioned truth.

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import path from "node:path";
import { targetStateDir } from "./config.js";

export function ensureStateDir(name) {
  const dir = targetStateDir(name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function baselinePath(name) {
  return path.join(targetStateDir(name), "baseline.json");
}

export function historyPath(name) {
  return path.join(targetStateDir(name), "history.jsonl");
}

/** Read current baseline; returns null if none exists yet. */
export function readBaseline(name) {
  const p = baselinePath(name);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

/** Atomically persist a new baseline snapshot. */
export function writeBaseline(name, rows, meta = {}) {
  ensureStateDir(name);
  const snapshot = {
    capturedAt: new Date().toISOString(),
    ...meta,
    rows,
  };
  writeFileSync(baselinePath(name), JSON.stringify(snapshot, null, 2) + "\n", "utf8");
  return snapshot;
}

/**
 * Append a run to history. Every row in history.jsonl is one observation:
 *   { capturedAt, ok, healthy, error?, rows?, diff?, summary? }
 */
export function appendHistory(name, entry) {
  ensureStateDir(name);
  appendFileSync(historyPath(name), JSON.stringify(entry) + "\n", "utf8");
}

export function readHistory(name, { limit = 1000 } = {}) {
  const p = historyPath(name);
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8")
    .split("\n")
    .filter(Boolean)
    .slice(-limit)
    .map((line) => JSON.parse(line));
}
