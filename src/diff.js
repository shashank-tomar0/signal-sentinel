// diff.js — the signal detector.
// Compares baseline rows vs current rows at a SEMANTIC level: which items were
// added/removed, which fields changed, and by how much. This is what makes
// Sentinel "structural" rather than a string diff of a page.

// --- helpers ---

function keyOf(row, keyField) {
  if (keyField) return String(row[keyField]);
  // Default: a stable identity from the first column that looks like an id/name.
  for (const k of Object.keys(row)) {
    if (["id", "name", "symbol", "slug", "repo", "rank", "title"].includes(k)) return String(row[k]);
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

  if (diffResult.added.length) {
    // New entries are usually the strongest signal (new tier, new product, new listing).
    severity = "critical";
    reasons.push(`new entries appeared (${diffResult.added.map((a) => a.key).join(", ")})`);
  }
  if (diffResult.removed.length) {
    severity = severity === "critical" ? "critical" : "major";
    reasons.push(`entries disappeared (${diffResult.removed.map((r) => r.key).join(", ")})`);
  }
  for (const m of diffResult.modified) {
    for (const c of m.changes) {
      const isNum = typeof c.to === "number" || classifyField(c.field) === "number";
      reasons.push(`${m.key} ${c.field}: ${c.from} -> ${c.to}`);
      // A numeric change >= 5% is a meaningful move.
      if (isNum && classifyField(c.field) === "number") {
        const from = num(c.from);
        const to = num(c.to);
        if (from !== null && to !== null && from !== 0) {
          const rel = Math.abs((to - from) / from);
          if (rel >= 0.05) severity = severity === "none" ? "major" : severity;
          if (rel >= 0.2) severity = "critical";
        }
      }
    }
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
