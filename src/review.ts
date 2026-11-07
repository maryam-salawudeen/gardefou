import { aiReview } from "./ai.js";
import { covers, pathFilter, type Config } from "./config.js";
import { parseDiff } from "./diff.js";
import { draftPia, type PiaContext } from "./pia.js";
import { runRules } from "./rules/index.js";
import { SEVERITY_RANK, type Finding, type ReviewResult } from "./types.js";
import { outsideCanada, outsideQuebec, type VendorDb } from "./vendors.js";

export interface ReviewOptions {
  config: Config;
  db: VendorDb;
  /** Without a key the review runs on rules alone. */
  ai?: { apiKey?: string; model?: string } | null;
  pia: PiaContext;
  log?: (msg: string) => void;
}

export async function review(diffText: string, opts: ReviewOptions): Promise<ReviewResult> {
  const keep = pathFilter(opts.config);
  const files = parseDiff(diffText).filter((f) => keep(f.path) || /(^|\/)package\.json$/.test(f.path));
  let findings = runRules(files, opts.db, opts.config);
  let summary = "";
  const ai: ReviewResult["ai"] = { used: false, dropped: 0, added: 0, redacted: 0 };

  if (opts.ai && files.length) {
    try {
      const result = await aiReview(files, findings, { ...opts.ai, laws: opts.config.laws, redact: opts.config.ai.redact });
      findings = result.findings;
      summary = result.summary;
      Object.assign(ai, { used: true, model: result.model, dropped: result.dropped, added: result.added, redacted: result.redacted });
    } catch (err) {
      // A failed AI pass shouldn't hide what the rules found.
      ai.error = err instanceof Error ? err.message : String(err);
      opts.log?.(`AI review skipped: ${ai.error}`);
    }
  }

  findings.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || a.path.localeCompare(b.path) || a.line - b.line);

  const piaDrafts = findings
    .filter((f): f is Finding & { vendor: NonNullable<Finding["vendor"]> } => (f.rule === "new-recipient" || f.rule === "ai-provider") && !!f.vendor)
    .filter((f) => (covers(opts.config, "QC") ? outsideQuebec(f.vendor.hq) : outsideCanada(f.vendor.hq)) !== "no")
    .map((f) => ({ vendor: f.vendor, markdown: draftPia(f.vendor, f, opts.pia, opts.config) }));

  if (!summary) summary = ruleSummary(findings);
  return { findings, summary, piaDrafts, ai };
}

function ruleSummary(findings: Finding[]): string {
  if (!findings.length) return "No changes to how personal information is handled or how AI is used were found.";
  const count = (rules: string[]) => findings.filter((f) => rules.includes(f.rule)).length;
  const vendors = count(["new-recipient"]);
  const ai = count(["ai-secret", "ai-provider", "ai-retention", "prompt-injection", "ai-output", "ai-agency", "automated-decision"]);
  const privacy = findings.length - vendors - ai;
  const parts: string[] = [];
  if (vendors) parts.push(`${vendors} new recipient${vendors > 1 ? "s" : ""} of data`);
  if (privacy) parts.push(`${privacy} change${privacy > 1 ? "s" : ""} to how personal information is handled`);
  if (ai) parts.push(`${ai} AI security issue${ai > 1 ? "s" : ""}`);
  const last = parts.pop();
  return `This pull request has ${parts.length ? parts.join(", ") + " and " + last : last}.`;
}

export function shouldFail(findings: Finding[], config: Config): boolean {
  if (config.failOn === "none") return false;
  const threshold = SEVERITY_RANK[config.failOn];
  return findings.some((f) => SEVERITY_RANK[f.severity] >= threshold);
}
