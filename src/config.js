// config.js — the target registry.
// Sentinel watches "targets": each is a real site surface backed by one or more
// webcmd commands. This is the human-editable config that defines what we watch
// and what a "signal" means for that target.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Default state location: repo-local so baselines are versioned by git.
// Override with SIGNAL_SENTINEL_DIR for deployed/isolated runs.
export const DEFAULT_DIR = path.resolve(__dirname, "..", ".sentinel");
export const SENTINEL_DIR = process.env.SIGNAL_SENTINEL_DIR
  ? path.resolve(process.env.SIGNAL_SENTINEL_DIR)
  : DEFAULT_DIR;

export const CONFIG_PATH = path.join(SENTINEL_DIR, "targets.json");

const DEFAULTS = {
  schemaVersion: 1,
  targets: [],
};

/**
 * A target config:
 *   name      – stable slug used for state paths (e.g. "acme-pricing")
 *   site      – webcmd site id (e.g. "coingecko")
 *   command   – webcmd command name (e.g. "top")
 *   args      – fixed args for this command (e.g. ["--limit","10"])
 *   watch     – array of field names that matter for diffing (empty = all)
 *   cadence   – minutes between scheduled runs (optional; default 1440)
 *   strategy  – informational: expected webcmd strategy (public/intercept/cookie/ui)
 */
export function defaults() {
  return structuredClone(DEFAULTS);
}

export function loadConfig() {
  if (!existsSync(CONFIG_PATH)) return defaults();
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch (e) {
    throw new Error(`could not parse ${CONFIG_PATH}: ${e.message}`);
  }
}

export function saveConfig(config) {
  mkdirSync(SENTINEL_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");
}

export function listTargets() {
  return loadConfig().targets;
}

export function getTarget(name) {
  return listTargets().find((t) => t.name === name);
}

export function upsertTarget(target) {
  const config = loadConfig();
  const existing = config.targets.findIndex((t) => t.name === target.name);
  if (existing === -1) config.targets.push(target);
  else config.targets[existing] = { ...config.targets[existing], ...target };
  saveConfig(config);
  return target;
}

export function removeTarget(name) {
  const config = loadConfig();
  const before = config.targets.length;
  config.targets = config.targets.filter((t) => t.name !== name);
  saveConfig(config);
  return config.targets.length !== before;
}

/** Where a target's baseline/history lives. */
export function targetStateDir(name) {
  return path.join(SENTINEL_DIR, "targets", name);
}
