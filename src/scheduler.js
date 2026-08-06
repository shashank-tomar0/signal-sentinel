// scheduler.js — continuous watch.
// A minimal, dependency-free scheduler that runs a target's command on its
// cadence, diffs against baseline, and (optionally) generates a brief when a
// material signal fires. Runs until stopped; used by `sentinel daemon`.

import { getTarget, listTargets } from "./config.js";
import { readBaseline, writeBaseline, appendHistory, readHistory } from "./state.js";
import { runCommand } from "./webcmd.js";
import { diffRows, classify } from "./diff.js";
import { generateBrief } from "./brief.js";

const SLEEP_MS = 60_000; // poll interval for cadence checking (1 min granularity)

async function tick(target) {
  const name = target.name;
  const baseline = readBaseline(name);

  const res = await runCommand(target.site, target.command, target.args || []);
  if (!res.ok) {
    appendHistory(name, {
      capturedAt: new Date().toISOString(),
      ok: false,
      healthy: false,
      error: res.error,
    });
    return { name, ok: false, healthy: false, error: res.error };
  }

  const rows = res.rows;

  // Seed baseline on first run.
  if (!baseline) {
    writeBaseline(name, rows, { healthy: true, source: `${target.site} ${target.command}` });
    appendHistory(name, {
      capturedAt: new Date().toISOString(),
      ok: true,
      healthy: true,
      rowsCount: rows.length,
      changed: false,
      severity: "none",
      baselineSeeded: true,
      summary: [`baseline established (${rows.length} rows)`],
    });
    return { name, ok: true, healthy: true, baselineSeeded: true, rowsCount: rows.length };
  }

  const result = diffRows(baseline.rows, rows, {
    keyField: target.keyField,
    watchFields: target.watch || [],
    numericTolerance: target.numericTolerance ?? 0.5,
  });
  const signal = classify(result, baseline.rows.length, rows.length);

  writeBaseline(name, rows, { healthy: true, source: `${target.site} ${target.command}` });
  const entry = {
    capturedAt: new Date().toISOString(),
    ok: true,
    healthy: true,
    rowsCount: rows.length,
    rawChanged: result.changed,
    changed: signal.severity !== "none",
    severity: signal.severity,
    summary: signal.reasons,
  };
  appendHistory(name, entry);

  // Generate a brief when a material signal fires (and store it).
  if (signal.severity !== "none") {
    const brief = await generateBrief({
      targetName: name,
      site: target.site,
      command: target.command,
      signal,
      capturedAt: entry.capturedAt,
      history: readHistory(name, { limit: 10 }),
    });
    // Persist the brief alongside history for later `sentinel brief --last`.
    // (Simple: store in the target state dir; a CLI read can pick it up.)
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const path = await import("node:path");
    const { targetStateDir } = await import("./config.js");
    mkdirSync(targetStateDir(name), { recursive: true });
    writeFileSync(path.join(targetStateDir(name), "brief.md"), brief, "utf8");
    return { name, ok: true, healthy: true, changed: true, severity: signal.severity, summary: signal.reasons, brief };
  }

  return { name, ok: true, healthy: true, changed: false, severity: signal.severity };
}

/**
 * Run one cycle over all targets whose cadence is due.
 * @param {object} opts { force: boolean }
 * @returns {Promise<Array>} results per target
 */
export async function runDueTargets({ force = false } = {}) {
  const now = Date.now();
  const results = [];
  for (const target of listTargets()) {
    const cadenceMs = (target.cadence || 1440) * 60 * 1000;
    const history = readHistory(target.name, { limit: 1 });
    const last = history[history.length - 1];
    const lastAt = last ? new Date(last.capturedAt).getTime() : 0;
    const due = force || now - lastAt >= cadenceMs;
    if (!due) continue;
    const r = await tick(target);
    results.push(r);
  }
  return results;
}

/** Blocking daemon loop. Ctrl-C to stop. */
export async function daemon({ force = false, interval = SLEEP_MS } = {}) {
  console.log(`sentinel daemon started (poll ${interval / 1000}s, force=${force})`);
  if (force) {
    const results = await runDueTargets({ force: true });
    console.log(`force cycle done: ${results.length} targets, ${results.filter((r) => r.changed).length} signals`);
  }
  for (;;) {
    await new Promise((r) => setTimeout(r, interval));
    try {
      const results = await runDueTargets({ force });
      for (const r of results) {
        if (!r.ok) console.log(`[fail] ${r.name}: ${r.error}`);
        else if (r.changed) console.log(`[signal] ${r.name}: ${r.severity}${r.summary?.length ? " — " + r.summary.join("; ") : ""}`);
        else if (r.baselineSeeded) console.log(`[seed] ${r.name}: baseline established`);
        else console.log(`[clean] ${r.name}`);
      }
    } catch (e) {
      console.error(`[daemon error] ${e.message}`);
    }
  }
}