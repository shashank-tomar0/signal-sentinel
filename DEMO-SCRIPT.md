# SignalSentinel — Live Demo Script

**Target runtime:** ≤5 minutes. **Mode:** live terminal (or screen recording of a real execution).

---

## The 30-second pitch (memorize this)

> "Your competitors changed their pricing, features, or positioning — and you found out
> three weeks late, by accident. SignalSentinel watches real sites, tells you exactly
> what changed, what it means, and what to do — and it repairs its own command library
> when those sites change."

---

## The commands — what you type and what's happening under the hood

### BEAT 1 — The Library (30s)

```bash
sentinel status
```

| What you type | What happens under the hood |
|---|---|
| `sentinel status` | Reads `.sentinel/targets.json` + each target's `history.jsonl`, prints a table: target name, state (clean/changed/broken), last run time. |

**Narration:** *"This is my command library. Each row is a real site my agent learned once, compiled into a fast deterministic command, and now keeps alive. Six real targets — live."*

---

### BEAT 2 — Reuse, not re-explore (the "fast/cheap" proof) (30s)

```bash
sentinel run
```

| Under the hood |
|---|
| For each target: spawns `webcmd <site> <command> [args] -f json` → gets **real JSON rows** from the live site → diffs against `baseline.json` (schema-aware) → classifies severity → appends to `history.jsonl`. Takes **~1–2s per target** because these are `public`/`intercept` commands — **no browser rendering, no screenshot reasoning.** |

**Narration:** *"Every other agent opens a browser, renders a page, and reasons over screenshots — slow, expensive, fragile. My agent calls a deterministic command that returns clean JSON in under a second. This is webcmd's whole thesis: explore once, reuse forever."*

---

### BEAT 3 — Watch for real signals (30s)

```bash
sentinel watch all
sentinel status          # shows which targets "changed"
sentinel history <name>  # shows the signal timeline
```

| Under the hood |
|---|
| `watch all` runs every target's command and diffs. `history` reads `history.jsonl` and shows each observation: `[timestamp] state severity what changed`. |

**Narration:** *"Product Hunt changed. GitHub trending changed. This is real, live drift — not a demo fixture."*

---

### BEAT 4 — The AI brief (the product, the closer) (60s)

```bash
sentinel brief <name>            # generate a fresh narrative
sentinel brief <name> --last     # show the persisted one
```

| Under the hood |
|---|
| Sends the diff (added/removed/modified rows + severity) to **Groq** (LLM) with the prompt *"You are SignalSentinel, a competitor-intelligence analyst. Write 3 sections: what changed, what it means, what to do. Max 150 words, don't invent facts."* Returns a real, human-readable brief. `--last` reads the `brief.md` the scheduler persisted. |

**Narration (read the brief):** *"Wispr Flow Notetaker jumped from 8th to 1st on Product Hunt. Likely a launch push. Monitor." — that's the whole product: a busy person finds out what changed and what to do about it, in plain language.*

---

### BEAT 5 — The self-heal (the technical wow) (60s)

```bash
sentinel repair <name>
```

| Under the hood |
|---|
| Runs `checkCommand` (re-verify the webcmd adapter). If the site changed structure and the command broke: prints "command is BROKEN", attempts **autonomous repair** (re-verify → re-explore via `webcmd browser` → rebuild adapter via `adapter-author`/`autofix` → re-verify), and if it can't recover, prints the **manual repair protocol** for an agent/human to run. |

**Narration:** *"When a watched site changes its structure, my command breaks. Sentinel doesn't crash — it detects the break, tries to re-teach itself, and if it can't, it hands you the exact protocol. This is a library that keeps itself alive."*

---

## The full 90-second one-command demo (for recording / backup)

```bash
sentinel demo [--target <name>]   # runs beats 1-5 automatically on real data
```

Run this, screen-record it, and you have a compliant backup (a real execution, not a mock).

---

## Timing sheet (5 min)

| Beat | Time | Command(s) |
|---|---|---|
| Pitch | 0:00–0:30 | — |
| 1. Library | 0:30–1:00 | `sentinel status` |
| 2. Reuse | 1:00–1:30 | `sentinel run` |
| 3. Signals | 1:30–2:00 | `sentinel watch all`, `sentinel status` |
| 4. Brief | 2:00–3:00 | `sentinel brief <name>` |
| 5. Self-heal | 3:00–4:00 | `sentinel repair <name>` |
| Close | 4:00–4:30 | one-liner |

---

## Recording backup (hard-rule compliant)

The hackathon allows a **screen recording of a real execution**. To record:
1. Open a terminal in `signal-sentinel/`
2. Start a screen recorder (OBS / Windows Game Bar: Win+G)
3. Run `sentinel demo`
4. Stop recording, save the clip

This is a real execution (real sites, real webcmd, real Groq) — fully compliant.
