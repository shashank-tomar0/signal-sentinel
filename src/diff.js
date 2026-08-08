// diff.js — the signal detector.
// Compares baseline rows vs current rows at a SEMANTIC level: which items were
// added/removed, which fields changed, and by how much. This is what makes
// Sentinel "structural" rather than a string diff of a page.

// --- helpers ---

function keyOf(row, keyField) {
  // If the configured keyField exists in the row, use it.
  if (keyField && row[keyField] !== undefined && row[keyField] !== null) return String(row[keyField]);
  // Fallback: the configured key is missing from the data (e.g. keyField "name"
  // but rows use "repo"). Auto-detect a STABLE identity — NOT "rank" (which
  // changes on every run). Prefer: id, name, symbol, slug, repo, title.
  for (const k of Object.keys(row)) {
    if (["id", "name", "symbol", "slug", "repo", "title"].includes(k) && row[k] !== undefined && row[k] !== null) return String(row[k]);
  }
  return JSON.stringify(row);
}

function num(v) {
  const n = typeof v === "string" ? Number(v.replace(/[$,]/g, "")) : Number(v);
  return Number.isFinite(n) ? n : null;
}

function classifyField(field) {
  const lower = field.toLowerCase();
  if (/(price|amount|cost|fee|salary|funding|revenue|marketcap|market_cap|volume|high|low|points|stars|score|votes|reviews|count|usd)/.test(lower)) return "number";
  if (/(trial|tier|plan|interval|type|status|category|language|country)/.test(lower)) return "categorical";
  return "string";
}

// --- the diff ---

/**
 * Compare two row arrays.
 * @param {Array} baseline baseline rows
 * @param {Array} current  current rows
 * @param {object} opts    { keyField, watchFields, numericTolerance }
 * @returns {{changed: boolean, added: [], removed: [], modified: [], summary: string[]}}
 */
export function diffRows(baseline, current, opts = {}) {
  const { keyField, watchFields = [], numericTolerance = 0 } = opts;
  const bMap = new Map(baseline.map((r) => [keyOf(r, keyField), r]));
  const cMap = new Map(current.map((r) => [keyOf(r, keyField), r]));

  const added = [];
  const removed = [];
  const modified = [];

  for (const [k, row] of cMap) {
    if (!bMap.has(k)) {
      added.push({ key: k, row });
    }
  }
  for (const [k, row] of bMap) {
    if (!cMap.has(k)) {
      removed.push({ key: k, row });
    }
  }

  for (const [k, base] of bMap) {
    const cur = cMap.get(k);
    if (!cur) continue;
    const fields = watchFields.length ? watchFields : Object.keys(base);
    const changes = [];
    for (const f of fields) {
      const bv = base[f];
      const cv = cur[f];
      if (JSON.stringify(bv) === JSON.stringify(cv)) continue;
      // Numeric tolerance suppresses meaningless jitter (ads, A/B, tick noise).
      if (classifyField(f) === "number" && num(bv) !== null && num(cv) !== null) {
        const diff = Math.abs(num(cv) - num(bv));
        const baseAbs = Math.abs(num(bv));
        const rel = baseAbs === 0 ? 0 : diff / baseAbs;
        if (numericTolerance > 0 && rel <= numericTolerance) continue;
      }
      changes.push({ field: f, from: bv, to: cv });
    }
    if (changes.length) modified.push({ key: k, changes });
  }

  const summary = [];
  if (added.length) summary.push(`${added.length} added (${added.map((a) => a.key).join(", ")})`);
  if (removed.length) summary.push(`${removed.length} removed (${removed.map((r) => r.key).join(", ")})`);
  for (const m of modified.slice(0, 8)) {
    for (const c of m.changes.slice(0, 3)) {
      summary.push(`${m.key} ${c.field}: ${c.from} -> ${c.to}`);
    }
  }

  return {
    changed: added.length > 0 || removed.length > 0 || modified.length > 0,
    added,
    removed,
    modified,
    summary,
  };
}

/**
 * Classify the overall diff into a severity + human signal summary.
 * @returns {{severity: "critical"|"major"|"minor"|"none", label: string, reasons: string[]}}
 */
export function classify(diffResult, baselineCount, currentCount) {
  const reasons = [];
  let severity = "none";

  // New entries are the strongest signal on a stable list (new tier, new
  // product, new listing). But on a churning ranked feed (HN, Product Hunt),
  // new items entering the board is routine. Distinguish by net size change:
  // a near-constant row count with both adds and removes = board churn (minor);
  // a list that grew (new tier/product) or shrank = structural (critical/major).
  if (diffResult.added.length) {
    const grewNet = diffResult.added.length > diffResult.removed.length;
    const shrankNet = diffResult.added.length < diffResult.removed.length;
    if (grewNet) {
      severity = "critical";
      reasons.push(`new entries appeared (${diffResult.added.map((a) => a.key).join(", ")})`);
    } else if (shrankNet) {
      // List shrank: added fewer than removed. Removed entries carry the signal.
      reasons.push(`${diffResult.added.length} new entries (${diffResult.added.map((a) => a.key).join(", ")})`);
    } else {
      // Net-zero swap on a ranked feed: routine board churn, not a material signal.
      reasons.push(`board churn — ${diffResult.added.length} new entries (${diffResult.added.map((a) => a.key).join(", ")})`);
    }
  }
  if (diffResult.removed.length) {
    if (severity !== "critical") severity = "major";
    reasons.push(`entries disappeared (${diffResult.removed.map((r) => r.key).join(", ")})`);
  }
  // Numeric magnitude drives severity for modified rows: <5% minor, 5-25% major,
  // >=25% critical. This branch previously could not fire (dead code).
  for (const m of diffResult.modified) {
    for (const c of m.changes) {
      const isNum = typeof c.to === "number" || classifyField(c.field) === "number";
      reasons.push(`${m.key} ${c.field}: ${c.from} -> ${c.to}`);
      if (isNum && classifyField(c.field) === "number") {
        const from = num(c.from);
        const to = num(c.to);
        if (from !== null && to !== null && from !== 0) {
          const rel = Math.abs((to - from) / from);
          if (rel >= 0.25) severity = "critical";
          else if (rel >= 0.05) severity = severity === "critical" ? "critical" : "major";
        }
      }
    }
  }

  // Floor: any modified rows that never reach the material threshold are still a signal.
  if (diffResult.modified.length && severity === "none") {
    severity = "minor";
  }

  const label =
    severity === "critical"
      ? "critical change detected"
      : severity === "major"
        ? "material change detected"
        : severity === "minor"
          ? "minor change detected"
          : "no material change";

  return { severity, label, reasons: reasons.slice(0, 12) };
}
