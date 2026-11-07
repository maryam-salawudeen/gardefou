import { pathFilter, type Config } from "../config.js";
import { SEVERITY_RANK, type DiffFile, type Finding } from "../types.js";
import type { VendorDb } from "../vendors.js";
import { personalInfoFields } from "./fields.js";
import { personalInfoLeaks } from "./leaks.js";
import { overCollection } from "./overcollection.js";
import { newRecipients } from "./recipients.js";
import { aiGuardrails } from "./ai.js";
import { redact } from "../redact.js";

export function runRules(files: DiffFile[], db: VendorDb, config: Config): Finding[] {
  const keep = pathFilter(config);
  const scoped = files.filter((f) => keep(f.path) || /(^|\/)package\.json$/.test(f.path));

  const all = [
    ...newRecipients(scoped, db, config),
    ...personalInfoLeaks(scoped),
    ...overCollection(scoped),
    ...personalInfoFields(scoped),
    ...aiGuardrails(scoped, config),
  ]
    .filter((f) => !config.ignoreRules.includes(f.rule))
    // Evidence is quoted in comments, so a secret on the line must not be.
    .map((f) => ({ ...f, evidence: redact(f.evidence).text }));

  return dedupe(all).sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || a.path.localeCompare(b.path) || a.line - b.line,
  );
}

// Two rules can fire on one line (a log call that also declares a field). Keep
// the more severe. New recipients always stay, because each one carries a PIA draft.
function dedupe(findings: Finding[]): Finding[] {
  const byLine = new Map<string, Finding>();
  for (const f of findings) {
    const key = f.vendor ? `vendor:${f.vendor.id}` : `${f.path}:${f.line}`;
    const existing = byLine.get(key);
    if (!existing || SEVERITY_RANK[f.severity] > SEVERITY_RANK[existing.severity]) byLine.set(key, f);
  }
  return [...byLine.values()];
}
