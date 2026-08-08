// webcmd.js — the hands.
// Thin, robust wrapper around the webcmd CLI. All browser/command execution
// funnels through here so the rest of Sentinel never touches child_process.
//
// Design rules:
//  - Prefer structured JSON output (`-f json`) everywhere; that is the contract
//    between webcmd and everything we build on top.
//  - A command failure is NOT a thrown exception. We return { ok:false, error }.
//    Sentinel's repair loop keys off these structured failures.
//  - Never assume webcmd is on PATH with a given name: win32 shims are .cmd.

import { execFile } from "node:child_process";

// Windows cannot execFile a .cmd shim directly (spawn EINVAL); route through cmd /c.
const WEBCMD_CMD = process.platform === "win32" ? "cmd" : "webcmd";
const WEBCMD_ARGS_BASE = process.platform === "win32" ? ["/c", "webcmd.cmd"] : [];

export function run(args, { timeout = 120_000, maxBuffer = 32 * 1024 * 1024 } = {}) {
  const fullArgs = [...WEBCMD_ARGS_BASE, ...args];
  return new Promise((resolve) => {
    execFile(
      WEBCMD_CMD,
      fullArgs,
      { timeout, maxBuffer, windowsHide: true, encoding: "utf8" },
      (err, stdout, stderr) => {
        if (err) {
          // Timeouts and nonzero exits are recoverable states, not crashes.
          const detail = (stderr || "").trim().slice(0, 400) || (stdout || "").trim().slice(0, 400);
          resolve({ ok: false, error: `webcmd ${args[0] ?? ""} failed: ${err.message}${detail ? ` — ${detail}` : ""}` });
          return;
        }
        resolve({ ok: true, output: stdout });
      },
    );
  });
}

// Extract JSON from stdout even when webcmd mixes in log lines or banners.
// We scan for the first top-level array/object instead of trusting the whole stream.
export function extractJson(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) return JSON.parse(trimmed);
  const arrIdx = trimmed.indexOf("[");
  const objIdx = trimmed.indexOf("{");
  const start = arrIdx === -1 ? objIdx : objIdx === -1 ? arrIdx : Math.min(arrIdx, objIdx);
  if (start === -1) throw new Error(`no JSON found in webcmd output: ${trimmed.slice(0, 200)}`);
  return JSON.parse(trimmed.slice(start));
}

/** webcmd list -f json — the "source of truth". */
export async function listCommands() {
  const res = await run(["list", "-f", "json"]);
  if (!res.ok) return res;
  try {
    return { ok: true, commands: extractJson(res.output) };
  } catch (e) {
    return { ok: false, error: `could not parse webcmd list output: ${e.message}` };
  }
}

// A site adapter not being installed is a first-run reality: signal-sentinel is
// a thin CLI over webcmd, and the per-site plugins ship from webcmd's repo, not
// from this package. Rather than fail with a confusing error, auto-install the
// missing plugin once, then retry. This is the same self-heal philosophy as the
// adapter repair loop — the library keeps itself alive.
const NOT_INSTALLED = /is not installed/i;

async function ensurePlugin(site) {
  const res = await run(["plugin", "install", `github:agentrhq/webcmd/${site}`], { timeout: 90_000 });
  return res.ok;
}

/**
 * Run a single webcmd command and return parsed rows.
 * @param {string} site  e.g. "coingecko"
 * @param {string} cmd   e.g. "top"
 * @param {string[]} args positional/flag args, e.g. ["--limit", "10"]
 * @param {string} format "json" (default) | "table" | "yaml" | "md" | "csv"
 */
export async function runCommand(site, cmd, args = [], format = "json") {
  let res = await run([site, cmd, ...args, "-f", format]);
  if (!res.ok && NOT_INSTALLED.test(res.error)) {
    // Auto-install the missing site plugin, then retry once.
    if (await ensurePlugin(site)) {
      res = await run([site, cmd, ...args, "-f", format]);
    } else {
      return { ok: false, error: `webcmd site "${site}" is not installed — run: webcmd plugin install github:agentrhq/webcmd/${site}` };
    }
  }
  if (!res.ok) return res;
  try {
    const data = extractJson(res.output);
    return { ok: true, rows: Array.isArray(data) ? data : [data] };
  } catch (e) {
    return { ok: false, error: `command ${site} ${cmd} returned unparseable output: ${e.message}` };
  }
}

/** Verify every command a target depends on, so the repair loop can detect drift. */
export async function checkCommand(site, cmd, args = []) {
  const res = await runCommand(site, cmd, args, "json");
  if (!res.ok) return { ...res, healthy: false };
  return { ...res, healthy: true };
}

/**
 * Autonomous repair via webcmd's autofix adapter lifecycle.
 * webcmd ships a webcmd-autofix skill; this drives the CLI surface so the
 * orchestrator (Claude Code / a scheduling agent) can re-learn a changed site
 * without manual intervention. Returns the result of the verification after
 * the re-exploration attempt.
 */
export async function repairCommand(site, cmd, args = [], { attempts = 2 } = {}) {
  const outcome = { site, cmd, repairs: [] };
  for (let i = 0; i < attempts; i++) {
    // 1) Re-verify first (the site may have healed itself or been transient).
    const check = await checkCommand(site, cmd, args);
    if (check.ok && check.healthy) {
      outcome.healthy = true;
      outcome.repaired = i > 0;
      return outcome;
    }
    // 2) Tell the agent to re-explore the live surface and rebuild the adapter.
    //    This is a thin CLI signal; the actual re-exploration is delegated to
    //    the orchestrator via webcmd's autofix skill.
    outcome.repairs.push({
      attempt: i + 1,
      action: "re-explore via webcmd browser + adapter-author/autofix",
      error: check.error,
    });
    // 3) Refresh the sitemap/adapter memory then retry verification.
    await run(["adapter", "eject", site], { timeout: 30_000 }).catch(() => {});
    await run(["adapter", "reset", site], { timeout: 30_000 }).catch(() => {});
    const retry = await checkCommand(site, cmd, args);
    if (retry.ok && retry.healthy) {
      outcome.healthy = true;
      outcome.repaired = true;
      return outcome;
    }
  }
  outcome.healthy = false;
  outcome.error = `repair failed after ${attempts} attempts for ${site} ${cmd}`;
  return outcome;
}
