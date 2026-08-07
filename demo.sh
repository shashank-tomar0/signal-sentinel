#!/usr/bin/env bash
# demo.sh — walk SignalSentinel end-to-end, MANUALLY (you drive, press Enter).
# Shows every command in the order a real user runs them, on real data.
# Usage:  ./demo.sh          (bash on macOS/Linux/WSL/Git Bash)

set -e

C="\033[0;36m"  # cyan — section header
G="\033[0;32m"  # green — the command being run
D="\033[0;90m"  # dim — narration
R="\033[0m"

say_header() { printf "\n\n${C}━━━ %s ━━━${R}\n" "$1"; }
say_cmd()    { printf "\n${G}\$ %s${R}\n" "$1"; }
cmd()        { say_cmd "$@"; }

pause() {
  printf "${D}────────────────────────────────────────────${R}\n"
  read -p "${D}→ press ENTER to continue…${R}" _
}

echo ""
echo "  ███████  ███████ ████   ████  ██████ ███████"
echo "  ██   ██ ██      ██ ██  ██ ██ ██  ██ ██"
echo "  ███████ ██      ██  ██ ██  ██ ██████ █████"
echo "  ██   ██ ██      ██  ██ ██  ██ ██  ██ ██"
echo "  ██   ██ ███████ ██  ██ ██  ██ ██  ██ ███████  — LIVE WALKTHROUGH"
echo ""
echo "Every command below runs against REAL public sites. You control pacing."
echo "Node 20+, webcmd installed, config initialized."

pause

# ── 1. init ──────────────────────────────────────────────────────────────
say_header "STEP 1 — init"
cmd "sentinel init"
sentinel init; pause

# ── 2. register a real target ─────────────────────────────────────────────
say_header "STEP 2 — register a real target"
cmd 'sentinel target add acme-pricing --site coingecko --command top --watch price,marketCap --key symbol -- --limit 10'
sentinel target add acme-pricing --site coingecko --command top --watch price,marketCap --key symbol -- --limit 10
pause

# ── 3. list targets ──────────────────────────────────────────────────────
say_header "STEP 3 — see the library"
cmd "sentinel target list"
sentinel target list
pause

# ── 4. first watch = establish baseline ─────────────────────────────────
say_header "STEP 4 — establish baseline (explore once, compile, verify)"
cmd "sentinel watch acme-pricing"
sentinel watch acme-pricing
pause

# ── 5. watch again = diff vs baseline ───────────────────────────────────
say_header "STEP 5 — watch again: diff the live surface vs baseline"
cmd "sentinel watch acme-pricing"
sentinel watch acme-pricing
pause

# ── 6. diff (no baseline update) ─────────────────────────────────────────
say_header "STEP 6 — inspect the raw diff (read-only)"
cmd "sentinel diff acme-pricing"
sentinel diff acme-pricing
pause

# ── 7. status: full library health ──────────────────────────────────────
say_header "STEP 7 — library health across all targets"
cmd "sentinel status"
sentinel status
pause

# ── 8. history ───────────────────────────────────────────────────────────
say_header "STEP 8 — audit trail per target"
cmd "sentinel history acme-pricing"
sentinel history acme-pricing
pause

# ── 9. AI brief -----------------------------------------------------------------
say_header "STEP 9 — the intelligence layer: plain-language brief"
cmd "sentinel brief acme-pricing"
sentinel brief acme-pricing
pause

# ── 10. state ─────────────────────────────────────────────────────────────
say_header "STEP 10 — where everything lives on disk"
cmd "sentinel state"
sentinel state
pause

# ── 11. run all due once ─────────────────────────────────────────────────
say_header "STEP 11 — force-run every due target (like the daemon does)"
cmd "sentinel run"
sentinel run
pause

# ── 12. repair / self-heal path ──────────────────────────────────────────
say_header "STEP 12 — the self-healing loop"
cmd "sentinel repair acme-pricing"
sentinel repair acme-pricing
pause

echo ""
echo "══════════════════════════════════════════════════════════"
echo "  demo complete. For continuous monitoring, run:"
echo "    sentinel daemon --force"
echo ""
echo "  tl;dr the whole arc —"
echo "    init → add → list → watch → watch → diff → status"
echo "            → history → brief → state → run → repair"
echo "══════════════════════════════════════════════════════════"