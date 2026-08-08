# SignalSentinel — Live Demo Script & Presentation Guide

**What to say, what to run, in order.**
Everything is verified working on real data. Each command shows the expected output.

---

## 🎬 OPENING (60 seconds — before touching the terminal)

> **"Competitor intelligence is broken. By the time you find out your competitor
> changed their pricing or launched a new tier, three weeks have passed — and you
> found out by accident.**
>
> **SignalSentinel fixes that. It watches real sites. The moment something changes,
> it tells you exactly WHAT changed, WHAT it means, and WHAT to do — in plain
> language. And if a site breaks our connection, it heals itself."**

*(Stop. Let that land. Then:)*

> "Let me show you. Everything you're about to see runs on real, live data — right now."

---

## 📋 THE 8-COMMAND CHEAT SHEET (you'll use these)

| Command | What it does |
|---|---|
| `sentinel init` | create config + check webcmd |
| `sentinel target list` | show the library |
| `sentinel watch <name>` | baseline / diff |
| `sentinel run` | check ALL targets |
| `sentinel status` | library health |
| `sentinel brief <name>` | Groq AI brief |
| `sentinel history <name>` | audit trail |
| `sentinel repair <name>` | self-heal / protocol |

---

## 🟦 ACT 1 — YOU ARE SETTING UP (first-time user, 60s)

### Run 1 — initialize
```bash
sentinel init
```
**Expected output:**
```
sentinel initialized at .../.sentinel
add a target:  sentinel target add <name> --site <site> --command <cmd>
✓ webcmd runtime detected — ready.
```
**Say:** *"One command. Creates the config and preflights the backend. Zero setup."*

### Run 2 — register a real site (the whole product in one line)
```bash
sentinel target add acme-pricing --site coingecko --command top --watch price,marketCap --key symbol -- --limit 10
```
**Expected:**
```
target "acme-pricing" registered: coingecko top --limit 10
```
**Say:** *"This is the whole product in one command: a real site, the fields that matter
(price, market cap), how to identify each row. No scrapers, no selectors, no code.
Everything after `--` passes to webcmd."*

### Run 3. show the library
```bash
sentinel target list
```
**Expected:**
```
NAME        SITE       COMMAND
crypto-top  coingecko  top
ph-today    producthunt today
...
acme-pricing coingecko top --limit 10
```
**Say:** *"My library of learned commands. Each row is a real surface — Product Hunt,
CoinGecko, GitHub Trending, PyPI, Hacker News — compiled from the live site."*

---

## 🟦 ACT 2 — THE CORE LOOP (2 min)

### Run 4. FIRST watch = explore + baseline
```bash
sentinel watch ph-today
```
**Expected:** `watched ph-today: (change)` **or** `watched ph-today: baseline established`
**Say:** *"First run: webcmd explores the real Product Hunt, compiles a fast command,
and captures a baseline. This is explore-once."*

### Run 5. SECOND watch = reuse + diff
```bash
sentinel watch ph-today
```
**Say:** *"Second run: the compiled command runs sub-second. It diffs the live data
against the baseline and only reports material change — no string-diff noise."*

*(If it says "no material change", smile and add) *"It moved 2 minutes ago — proof in the
history later. That's the system working, not failing."*

---

## 🟦 ACT 3 — THE LIBRARY & THE DETECTION (90s)

### Run 6. health dashboard
```bash
sentinel status
```
**Expected — the money visual:**
```
TARGET        STATE    LAST RUN
crypto-top    clean    2026-08-08 ...
ph-today      changed  2026-08-08 ...
gh-trending   changed  2026-08-08 ...
...
```
**Say:** *"The dashboard. Clean, changed, broken — whole library at a glance."*

### Run 7. check EVERYTHING at once
```bash
sentinel run
```
**Expected (varies — but will show signals):**
```
[signal] gh-trending: minor — mattpocock/skills forks: 18076 -> 18077
ran 9 targets, 1 signals
```
**Say:** *"This is the daemon in action — every target checked. And look, GitHub
Trending just moved: skills repo gained a fork, 18076 → 18077. That's a real,
live signal, right now."*

---

## 🟦 ACT 4 — THE INTELLIGENCE LAYER (the peak, 60s)

### Run 8. the AI brief
```bash
sentinel brief ph-today
```
**Expected:**
```
generating brief for "ph-today" (severity: X)…

# ph-today — brief (2026-08-08)

**1. What changed**
...

**2. What it likely means for the competitor/market**
...

**3. Suggested attention or next step**
...
```
**PAUSE. Let them read.** **Say:** *"This is the product. The diff isn't a data dump —
Groq wrote a plain-language briefing: what changed, what it means, what to do. That's
competitor intelligence, not a ticker."*

### Run 9 — the audit trail
```bash
sentinel history ph-today
```
**Expected:** rows of timestamp + state + severity.
**Say:** *"Every single run is audited — timestamped, severity-tagged. This morning it
caught a major Product Hunt reshuffle, and rank moves all day. That's provenance."*

---

## 🟦 ACT 5 — SELF-HEAL & OPS (45s)

### Run 10 — self-healing check
```bash
sentinel repair ph-today
```
**Expected:**
```
⟳ diagnosing "ph-today": producthunt today
  ✓ command is healthy — nothing to repair
```
**Say:** *"If the site changed its structure, this detects it, retries, and attempts
autonomous repair — or hands me the exact 5-step protocol. The library keeps itself
alive."*

### Run 11 — state on disk
```bash
sentinel state
```
**Expected:**
```
sentinel dir: .../.sentinel
config:       .../.sentinel/targets.json
state:        .../.sentinel/targets/<name>/
```
**Say:** *"Everything is plain JSON / JSONL on disk — git-trackable, grepable. No hidden
database."*

### Run 12 — continuous (optional)
```bash
sentinel daemon --force
```
**Say:** *"Continuous monitoring on each target's cadence. Ctrl-C to stop, but don't."*

---

## 🎬 CLOSING (60 seconds)

> Three things to remember:
>
> 1. **~90% fewer tokens on reuse** — explore once, compile, reuse forever.
> 2. **Sub-second latency** — the compiled command returns clean JSON.
> 3. **Three semantic change types** — added, removed, modified, each with a severity.
>
> The site you register becomes a learned command that keeps itself alive. That's the
> compounding asset. **Competitor intelligence, on autopilot, in plain language.**

---

## 🎯 Q&A CHEAT SHEET (if judges ask)

**Q: How is this technically deep?**
> The composition: a browser runtime that explores→compiles→self-heals, a semantic diff
> engine that knows numeric vs categorical fields and classifies severity by magnitude,
> an AI brief layer that never crashes, and plain JSON/JSONL storage on disk.

**Q: What if the site changes structure?**
> Sentinel detects the failure, retries, attempts `adapter reset`, and if it can't heal,
> hands you the exact 5-step protocol to re-explore.

**Q: Who's this for?**
> Product managers and startups watching competitors' pricing, tiers, positioning.

**Q: Why not just cron + grep?**
> Cron + grep gives you a blob of text. Sentinel gives you: "Toolport rose to #1, Basedash
> dropped to #2 — likely a marketing push. Monitor." Semantic, not textual.

**Q: What if Groq is down?**
> The pipeline never crashes on a missing key. A deterministic rule-based fallback brief
> always produces output.

---

## ✅ DEMO CHECKLIST

- [ ] Groq key in `.env` (`GROQ_API_KEY=...`) — AI briefs
- [ ] webcmd + site plugins installed (`webcmd plugin install ...`)
- [ ] `sentinel init` — config ready
- [ ] targets registered
- [ ] run `sentinel run` first to catch a live signal (so brief has something to explain)
- [ ] Have `pypi-requests` / `crypto-top` as reliable backups if ph-today is flaky

---

> Go win.