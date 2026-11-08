import type { Config } from "./config.js";
import { cite, DISCLAIMER } from "./law.js";
import type { Finding, ReviewResult, Severity } from "./types.js";

export const MARKER = "<!-- gardefou -->";

const BADGE: Record<Severity, string> = { high: "🔴 High", medium: "🟠 Medium", low: "🟡 Low" };

/** A stable id per finding, so a re-run doesn't post the same comment twice. */
export function fingerprint(f: Finding): string {
  const key = f.rule === "new-recipient" ? `vendor:${f.vendor?.id}` : `${f.rule}:${f.path}:${f.evidence}`;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (Math.imul(31, h) + key.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function inlineComment(f: Finding, config: Config): string {
  const sources = cite(f.sections, config.laws);
  return [
    `**${BADGE[f.severity]} · ${f.title}**`,
    "",
    f.body,
    ...(sources ? ["", `<sub>${sources}</sub>`] : []),
    "",
    `<!-- gardefou:${fingerprint(f)} -->`,
  ].join("\n");
}

export function summaryComment(result: ReviewResult, config: Config, inlineCount: number): string {
  const { findings, summary, piaDrafts, ai } = result;
  const counts = (["high", "medium", "low"] as const)
    .map((s) => [s, findings.filter((f) => f.severity === s).length] as const)
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${BADGE[s]}: ${n}`)
    .join(" · ");

  const lines = [MARKER, "## Privacy and AI security review", "", summary, ""];
  if (counts) lines.push(counts, "");

  if (findings.length) {
    lines.push("| | Finding | Where |", "|---|---|---|");
    for (const f of findings) lines.push(`| ${BADGE[f.severity]} | ${escapeCell(f.title)} | \`${f.path}:${f.line}\` |`);
    lines.push("");
    if (inlineCount < findings.length) {
      lines.push(`${findings.length - inlineCount} finding(s) aren't commented inline, either because the comment limit was reached or the line is outside the diff.`, "");
    }
  }

  for (const draft of piaDrafts) {
    lines.push(
      "<details>",
      `<summary>Privacy impact assessment draft: ${draft.vendor.name}</summary>`,
      "",
      draft.markdown,
      "</details>",
      "",
    );
  }

  const how = ai.used
    ? `Rules plus AI review (${ai.model}${ai.dropped ? `, ${ai.dropped} rule finding(s) dismissed as not applicable` : ""}${ai.redacted ? `, ${ai.redacted} secret or personal value(s) removed from the diff before it was sent` : ""}).`
    : ai.error
      ? `Rules only. The AI review didn't run: ${ai.error}`
      : "Rules only. Add an `anthropic-api-key` to have each finding checked in context.";
  lines.push(`<sub>${how} ${DISCLAIMER}</sub>`);
  return lines.join("\n");
}

/** Plain text for the terminal. */
export function terminalReport(result: ReviewResult, config: Config): string {
  const out = [result.summary, ""];
  for (const f of result.findings) {
    out.push(`${f.severity.toUpperCase().padEnd(6)} ${f.path}:${f.line}  ${f.title}`);
    out.push(indent(f.body.replace(/\*\*/g, "").replace(/`/g, "")));
    const sources = cite(f.sections, config.laws).replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
    if (sources) out.push(indent(sources));
    out.push("");
  }
  return out.join("\n");
}

function indent(text: string): string {
  return text
    .split("\n")
    .map((l) => (l ? "       " + l : l))
    .join("\n");
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, "\\|");
}
