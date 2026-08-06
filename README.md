# SignalSentinel

**Competitor-change intelligence, built on webcmd.**

> Your competitors changed their pricing, features, or positioning — and you found
> out three weeks late, by accident. SignalSentinel watches their real sites, tells
> you exactly *what* changed, *what it means*, and *what to do* — and it repairs
> its own command library when those sites change.

## Why

- **Real**: watches real live sites. No mocks, no demo data.
- **Structural**: detects *meaningful* change (new tier added, trial removed, price
  moved), not string diffs or price ticker noise.
- **Self-healing**: when a watched site changes its structure, the command breaks,
  Sentinel detects the break, and the repair loop re-explores and fixes the adapter.
- **Compounding**: baselines + history are versioned in git — the more you watch,
  the more your library knows.

## How it works

```
sentinel target add <name> --site <site> --command <cmd>   # register a real surface
sentinel watch <name>                                      # run, diff vs baseline, update
sentinel diff <name>                                       # show the signal
sentinel status                                            # library health
```

Every target is backed by a webcmd command that returns schema-valid JSON. Sentinel
diffs that JSON semantically, classifies the signal (critical/major/minor/none), and
records every run in `history.jsonl` with the baseline in `baseline.json` — all inside
`.sentinel/`, versioned by git.

## Quick start

```bash
npm install -g @agentrhq/webcmd   # webcmd runtime (Node 20+)
webcmd skills add                 # install the agent skills

git clone <this repo> && cd signal-sentinel
npm link                          # expose `sentinel` on PATH
sentinel init

# register a real target — e.g. watch the crypto top-10 for signals
sentinel target add crypto-top --site coingecko --command top --args "--limit 10" --watch "price,marketCap" --key symbol

sentinel watch crypto-top         # first run = baseline
sentinel watch crypto-top         # second run = diff vs baseline
sentinel status
```

## Architecture

- `src/webcmd.js` — thin, robust wrapper around the webcmd CLI (JSON out, structured errors)
- `src/config.js` — target registry (`targets.json`)
- `src/state.js` — versioned baselines + append-only history
- `src/diff.js` — semantic diff + signal classifier
- `bin/sentinel.js` — the CLI surface
- `webcmd` — the browser infra we build on (explore → compile → reuse → repair)

## Demo targets (real, live)

| target | site/command | what it watches |
|---|---|---|
| `crypto-top` | `coingecko top` | top-10 coin prices, market cap (structural: rank/market cap moves) |
| `ph-today` | `producthunt today` | today's launches (new product signals) |
| `gh-trending` | `github-trending repos` | trending repos (new signals by language) |

## License

MIT
