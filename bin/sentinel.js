#!/usr/bin/env node
// sentinel.js — the product shell.
// A thin CLI over webcmd: register targets, run their commands, diff against
// baseline, classify signals, and report. The user never touches webcmd directly.

import {
  loadConfig,
  listTargets,
  getTarget,
  upsertTarget,
  removeTarget,
  SENTINEL_DIR,
} from "../src/config.js";
import {
  readBaseline,
  writeBaseline,
  appendHistory,
  readHistory,
} from "../src/state.js";
import { runCommand, checkCommand, listCommands, repairCommand } from "../src/webcmd.js";
import { diffRows, classify } from "../src/diff.js";
import { generateBrief, fallbackBrief } from "../src/brief.js";
import { daemon as runDaemon, runDueTargets } from "../src/scheduler.js";

const HELP = `
sentinel — competitor-change intelligence on webcmd

Usage:
  sentinel init                    Create .sentinel config
  sentinel target list             List registered targets
  sentinel target add <name>       Register a target (interactive, or use --flags)
      --site <site>  --command <cmd>  [--args "..."]  [--watch "a,b,c"]  [--key <field>]
  sentinel target rm <name>        Remove a target
  sentinel watch <name>            Run command, diff vs baseline, update baseline
  sentinel watch all               Watch every registered target
  sentinel diff <name>             Show last diff without updating baseline
  sentinel status                  Library health: commands, failures, repairs
  sentinel history <name>          Show recent run history
  sentinel brief <name>            Generate a plain-language signal brief
  sentinel repair <name>           Diagnose a broken command + emit repair protocol
  sentinel daemon [--force]       Run continuous watch loop (scheduler)
  sentinel run                    Force-run all due targets once
  sentinel state                   Show sentinel dir + config path

Options:
  -h, --help   Show this help
`.trim();

function log(msg) {
  console.log(msg);
}

function err(msg) {
  console.error(`✗ ${msg}`);
}

function now() {
  return new Date().toISOString();
}

function parseArgs(args) {
  const flag = (name) => {
    const i = args.indexOf(`--${name}`);
    if (i === -1) return undefined;
    const v = args[i + 1];
    return v === undefined || v.startsWith("--") ? undefined : v;
  };
  return { flag };
}

// --- commands ---

function cmdInit() {
  // loadConfig() already ensures a readable state; save to materialize defaults.
  loadConfig();
  log(`sentinel initialized at ${SENTINEL_DIR}`);
  log("add a target:  sentinel target add <name> --site <site> --command <cmd>");
}

function cmdTargetList() {
  const targets = listTargets();
  if (!targets.length) {
    log("no targets registered yet — sentinel target add <name> --site <site> --command <cmd>");
    return;
  }
  log(`${"NAME".padEnd(22)}${"SITE".padEnd(14)}COMMAND`);
  for (const t of targets) {
    log(`${t.name.padEnd(22)}${t.site.padEnd(14)}${t.command} ${(t.args || []).join(" ")}`);
  }
}

function cmdTargetAdd(args) {
  const { flag } = parseArgs(args);
  // Positional args follow the command name: sentinel target add <name> ...
  const argPos = args.indexOf("add");
  const name = args[argPos + 1];
  const site = flag("site");
  const command = flag("command");
  const argsStr = flag("args");
  const watch = flag("watch");
  const key = flag("key");

  if (!name || !site || !command) {
    err("target add requires: <name> --site <site> --command <cmd>");
    process.exit(1);
  }
  const target = {
    name,
    site,
    command,
    args: argsStr ? argsStr.split(/\s+/) : [],
    watch: watch ? watch.split(",").map((s) => s.trim()).filter(Boolean) : [],
    keyField: key || undefined,
    cadence: 1440,
    addedAt: now(),
  };
  upsertTarget(target);
  log(`target "${name}" registered: ${site} ${command} ${target.args.join(" ")}`);
}

function cmdTargetRm(args) {
  const name = args[2];
  if (!name) return err("usage: sentinel target rm <name>");
  const removed = removeTarget(name);
  log(removed ? `removed target "${name}"` : `no target named "${name}"`);
}

async function cmdDiff(name, { apply = false } = {}) {
  const target = getTarget(name);
  if (!target) return err(`unknown target "${name}" — sentinel target list`);

  const baseline = readBaseline(name);

  const res = await runCommand(target.site, target.command, target.args || []);
  if (!res.ok) {
    // Command is BROKEN. This is the repair trigger.
    appendHistory(name, {
      capturedAt: now(),
      ok: false,
      healthy: false,
      error: res.error,
    });
    err(`command for "${name}" failed: ${res.error}`);
    err("site changed? the repair loop should re-explore and fix the adapter.");
    return null;
  }

  const rows = res.rows;
  // No baseline yet: this is the seed run. Establish the baseline, no diff.
  if (!baseline) {
    writeBaseline(name, rows, { healthy: true, source: `${target.site} ${target.command}` });
    appendHistory(name, {
      capturedAt: now(),
      ok: true,
      healthy: true,
      rowsCount: rows.length,
      changed: false,
      severity: "none",
      baselineSeeded: true,
      summary: [`baseline established (${rows.length} rows)`],
    });
    return { target, baseline: null, rows, result: null, signal: null, entry: { baselineSeeded: true } };
  }

  const result = diffRows(baseline.rows, rows, {
    keyField: target.keyField,
    watchFields: target.watch || [],
    numericTolerance: target.numericTolerance ?? 0.5, // 0.5% — suppresses ticker jitter
  });
  const signal = classify(result, baseline.rows.length, rows.length);

  const entry = {
    capturedAt: now(),
    ok: true,
    healthy: true,
    rowsCount: rows.length,
    rawChanged: result.changed,
    changed: signal.severity !== "none", // material only
    severity: signal.severity,
    summary: signal.reasons,
  };

  if (apply) {
    writeBaseline(name, rows, { healthy: true, source: `${target.site} ${target.command}` });
    entry.baselineUpdated = true;
  }
  appendHistory(name, entry);

  return { target, baseline, rows, result, signal, entry };
}

async function cmdWatch(args) {
  const name = args[0];
  if (name === "all") {
    const targets = listTargets();
    if (!targets.length) return err("no targets registered");
    let changed = 0;
    for (const t of targets) {
      log(`\n— ${t.name} —`);
      const r = await cmdDiff(t.name, { apply: true });
      if (r?.result?.changed) changed++;
    }
    log(`\n${targets.length} targets watched, ${changed} with signals`);
    return;
  }
  if (!name) return err("usage: sentinel watch <name> | all");
  const r = await cmdDiff(name, { apply: true });
  if (!r) return;
  if (r.entry?.baselineSeeded) {
    log(`watched ${name}: baseline established (${r.rows.length} rows). Run again to diff.`);
    return;
  }
  log(`watched ${name}: ${r.signal.label}`);
  if (r.result.changed) {
    for (const s of r.signal.reasons) log(`  • ${s}`);
    log(`severity: ${r.signal.severity}`);
  } else {
    log("  no material change");
  }
}

async function cmdStatus() {
  const targets = listTargets();
  if (!targets.length) return log("library empty — sentinel target add ...");
  log(`${"TARGET".padEnd(22)}${"STATE".padEnd(9)}LAST RUN`);
  for (const t of targets) {
    const history = readHistory(t.name, { limit: 1 });
    const last = history[history.length - 1];
    const state = last
      ? last.healthy
        ? last.changed
          ? "changed"
          : "clean"
        : "broken"
      : "no runs";
    const when = last ? last.capturedAt.slice(0, 16).replace("T", " ") : "—";
    log(`${t.name.padEnd(22)}${state.padEnd(9)}${when}`);
  }
}

// The self-healing beat. A broken webcmd command (site changed) is the repair
// trigger. Sentinel confirms breakage, then tells the orchestrator (Claude Code)
// exactly how to re-explore and repair the adapter — the technical-depth story.
async function cmdRepair(args) {
  const name = args[0];
  if (!name) return err("usage: sentinel repair <name>");
  const target = getTarget(name);
  if (!target) return err(`unknown target "${name}"`);

  log(`⟳ diagnosing "${name}": ${target.site} ${target.command}`);
  const res = await checkCommand(target.site, target.command, target.args || []);
  if (res.ok && res.healthy) {
    log(`  ✓ command is healthy — nothing to repair`);
    return;
  }
  log(`  ✗ command is BROKEN: ${res.error ?? "unknown error"}`);
  log(`  ⟶ root cause: the target site likely changed its structure.`);
  log(`  ⟶ attempting AUTONOMOUS repair (webcmd autofix lifecycle)…`);

  // Autonomous path: attempt to re-learn + rebuild the adapter.
  const auto = await repairCommand(target.site, target.command, target.args || []);
  if (auto.healthy) {
    log(`  ✓ AUTONOMOUS REPAIR SUCCEEDED (${auto.repaired ? "adapter rebuilt" : "transient recovery"})`);
    appendHistory(name, {
      capturedAt: now(),
      ok: true,
      healthy: true,
      autonomousRepair: true,
      repaired: auto.repaired,
      summary: ["autonomous repair succeeded"],
    });
    return;
  }
  log(`  ✗ autonomous repair did not fully recover — falling back to manual protocol:`);

  // Emit the exact re-education step for the orchestrator.
  log("");
  log(`  REPAIR PROTOCOL (automate with Claude Code + webcmd skills):`);
  log(`    1. webcmd browser ${target.site}  — re-explore the live surface`);
  log(`    2. webcmd-sitemap-author         — refresh sitemap memory`);
  log(`    3. webcmd-adapter-author          — rebuild the ${target.command} command`);
  log(`    4. webcmd verify ${target.site} ${target.command}  — confirm schema`);
  log(`    5. sentinel watch ${name}         — re-baseline`);
  log("  (A full autonomous repair can be delegated as a Claude Code task —");
  log("   give it the target, the failing command, and this protocol.)");
  appendHistory(name, {
    capturedAt: now(),
    ok: false,
    healthy: false,
    repairRequested: true,
    error: res.error,
  });
}

async function cmdHistory(args) {
  const name = args[0];
  if (!name) return err("usage: sentinel history <name>");
  const entries = readHistory(name, { limit: 20 });
  if (!entries.length) return log(`no history for "${name}"`);
  for (const e of entries.reverse()) {
    const state = e.healthy ? (e.changed ? "changed" : "clean") : "broken";
    log(`${e.capturedAt.slice(0, 19).replace("T", " ")}  ${state.padEnd(8)} ${(e.severity || "—").padEnd(9)} ${(e.summary || []).slice(0, 2).join(" | ")}`);
  }
}

async function cmdBrief(args) {
  const name = args[0];
  if (!name) return err("usage: sentinel brief <name>");
  const target = getTarget(name);
  if (!target) return err(`unknown target "${name}"`);

  const history = readHistory(name, { limit: 20 });
  const latest = history[history.length - 1];
  if (!latest) {
    log(`no runs yet for "${name}" — run sentinel watch ${name} first`);
    return;
  }
  // Reuse the most recent signal if any, else a "no material change" brief.
  const signal = latest.changed
    ? { label: "change detected", severity: latest.severity || "major", reasons: latest.summary || [] }
    : { label: "no material change", severity: "none", reasons: [] };

  log(`generating brief for "${name}" (severity: ${signal.severity})…`);
  const brief = await generateBrief({
    targetName: name,
    site: target.site,
    command: target.command,
    signal,
    capturedAt: latest.capturedAt,
    history,
  });
  log("\n" + brief + "\n");
}

async function cmdDaemon(args) {
  const force = args.includes("--force");
  log(`starting daemon (force=${force}) — Ctrl-C to stop`);
  await runDaemon({ force });
}

async function cmdRunDue() {
  const results = await runDueTargets({ force: true });
  log(`ran ${results.length} targets, ${results.filter((r) => r.changed).length} signals`);
}

function cmdState() {
  log(`sentinel dir: ${SENTINEL_DIR}`);
  log(`config:       ${SENTINEL_DIR}/targets.json`);
  log(`state:        ${SENTINEL_DIR}/targets/<name>/`);
}

// --- dispatch ---

async function main() {
  const args = process.argv.slice(2);
  const [cmd, ...rest] = args;

  if (!cmd || cmd === "-h" || cmd === "--help") {
    log(HELP);
    return;
  }

  try {
    switch (cmd) {
      case "init": return cmdInit();
      case "target": {
        const sub = rest[0];
        if (sub === "list") return cmdTargetList();
        if (sub === "add") return cmdTargetAdd(args);
        if (sub === "rm") return cmdTargetRm(args);
        return err("usage: sentinel target list | add | rm");
      }
      case "watch": return await cmdWatch(rest);
      case "diff": return await cmdDiff(rest[0]);
      case "status": return await cmdStatus();
      case "history": return await cmdHistory(rest);
      case "brief": return await cmdBrief(rest);
      case "repair": return await cmdRepair(rest);
      case "daemon": return await cmdDaemon(rest);
      case "run": return await cmdRunDue();
      case "state": return cmdState();
      default: err(`unknown command "${cmd}"`); log(HELP); process.exit(1);
    }
  } catch (e) {
    err(e.message);
    process.exit(1);
  }
}

main();
