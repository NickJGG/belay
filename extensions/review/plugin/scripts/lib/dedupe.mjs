const SEVERITIES = ['CRITICAL', 'IMPORTANT', 'DEBT', 'SUGGESTED', 'QUESTION'];

export function severityRank(severity) {
  const i = SEVERITIES.indexOf(String(severity ?? '').toUpperCase());
  return i === -1 ? SEVERITIES.length : i;
}

function normalizeKey(key) {
  return key.trim().toLowerCase().replace(/\\/g, '/');
}

export function validFinding(f) {
  return Boolean(f) && typeof f === 'object' && typeof f.root_cause_key === 'string' && f.root_cause_key.trim() !== '';
}

// One group per normalized key, highest severity first, then first seen. found_by lists distinct
// reviewers (information only); severity is the group's highest. Nothing is capped or dropped.
export function dedupe(findings) {
  const groups = new Map();
  for (const f of findings) {
    const key = normalizeKey(f.root_cause_key);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  const out = [...groups].map(([key, group]) => {
    const top = group.reduce((best, f) => (severityRank(f.severity) < severityRank(best.severity) ? f : best));
    const reviewers = [...new Set(group.map((f) => f.reviewer).filter(Boolean))].sort();
    return { root_cause_key: key, findings: group, found_by: reviewers, severity: top.severity ?? null };
  });
  out.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  return out;
}
