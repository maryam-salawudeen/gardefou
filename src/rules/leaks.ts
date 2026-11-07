import { HEALTH_SECTIONS } from "../law.js";
import type { DiffFile, Finding, Severity } from "../types.js";
import { categoryOf, type PiCategory } from "./pi.js";
import { identifiers, isComment, truncate } from "./util.js";

type Sink = "log" | "analytics" | "error-tracking" | "llm" | "url";

const SINKS: { sink: Sink; pattern: RegExp }[] = [
  { sink: "error-tracking", pattern: /\b(?:Sentry|Bugsnag|Rollbar|datadogRum|DD_RUM)\.(?:setUser|setContext|setExtra|setTag|addBreadcrumb|captureMessage)\s*\(/ },
  { sink: "analytics", pattern: /\b(?:track|identify|capture|setUserProperties|setPersonProperties|people\.set|dataLayer\.push|gtag|fbq|ttq\.track)\s*\(/ },
  { sink: "llm", pattern: /\b(?:messages\.(?:create|stream|parse)|chat\.completions\.create|responses\.create|generateText|streamText|generateObject|generateContent|embeddings\.create)\s*\(/ },
  { sink: "log", pattern: /\b(?:console\.(?:log|info|warn|error|debug|trace)|logger\.\w+|log\.(?:info|debug|warn|warning|error|trace|fatal)|logging\.\w+|print|println|Log\.[dviwe]|fmt\.Print\w*)\s*\(|\bputs\s/ },
  { sink: "url", pattern: /[?&](?:email|e-mail|phone|sin|dob|first_?name|last_?name|postal_?code)=/i },
];

// A whole record sent at once usually carries more than anyone meant to send.
const WHOLE_RECORD = /\b(?:req\.body|request\.body|request\.json\(\)|request\.form|ctx\.request\.body)\b|[(,]\s*(?:user|customer|patient|member|profile|applicant|employee)\s*[,)]/;

/** Flags personal information written to logs, analytics, error trackers, AI prompts or URLs. */
export function personalInfoLeaks(files: DiffFile[]): Finding[] {
  const findings: Finding[] = [];

  for (const file of files) {
    file.added.forEach(({ line, text }, i) => {
      if (isComment(text)) return;
      const sink = SINKS.find((s) => s.pattern.test(text))?.sink;
      if (!sink) return;

      const call = sink === "url" ? text : callText(file.added, i);
      const cats = new Map<string, PiCategory>();
      for (const id of identifiers(call)) {
        const cat = categoryOf(id);
        if (cat) cats.set(cat.id, cat);
      }
      const wholeRecord = WHOLE_RECORD.test(call);
      if (!cats.size && !wholeRecord && sink !== "url") return;

      findings.push(toFinding(file.path, line, text, sink, [...cats.values()], wholeRecord));
    });
  }
  return findings;
}

// A call often spans several lines (an AI prompt, an analytics payload). Read
// on until its brackets close, up to 12 consecutive added lines.
function callText(added: DiffFile["added"], start: number): string {
  let text = "";
  let depth = 0;
  for (let i = start; i < added.length && i < start + 12; i++) {
    if (i > start && added[i]!.line !== added[i - 1]!.line + 1) break;
    const t = added[i]!.text;
    text += t + "\n";
    for (const ch of t) {
      if (ch === "(" || ch === "{" || ch === "[") depth++;
      else if (ch === ")" || ch === "}" || ch === "]") depth--;
    }
    if (depth <= 0) break;
  }
  return text;
}

const SINK_TEXT: Record<Sink, string> = {
  log: "a log",
  analytics: "an analytics or advertising tool",
  "error-tracking": "an error tracker",
  llm: "an AI model prompt",
  url: "a URL query string",
};

function toFinding(path: string, line: number, text: string, sink: Sink, cats: PiCategory[], wholeRecord: boolean): Finding {
  const what = cats.length
    ? `personal information (${cats.map((c) => c.label).join(", ")})`
    : wholeRecord
      ? "a whole record, which can carry every field it has"
      : "personal information";
  const sensitive = cats.some((c) => c.sensitive);
  const thirdParty = sink !== "log";

  const paragraphs = [`This sends ${what} to ${SINK_TEXT[sink]}.`];
  if (sink === "log") {
    paragraphs.push(
      "Logs are copied to other systems, kept for a long time and read by more people than the database. Log an internal id instead, or mask the value.",
    );
  } else if (sink === "url") {
    paragraphs.push("Query strings end up in server logs, browser history and Referer headers sent to other sites. Send it in the request body instead.");
  } else if (sink === "llm") {
    paragraphs.push(
      "The prompt goes to the AI provider, and can come back out in answers, logs or the provider's systems. Send only the fields the task needs, and replace identifiers with placeholders before the call.",
    );
  } else {
    paragraphs.push("That vendor receives it, so this counts as communicating personal information to a third party. Send an internal id or a hash instead.");
  }
  if (wholeRecord && cats.length) paragraphs.push("It also passes a whole record, which can carry more fields than these.");

  const sections = ["law25-s10", "pipeda-4.7", "pipa-ab-s34", "pipa-bc-s34"];
  if (thirdParty) sections.unshift("law25-s17", "pipeda-4.1.3");
  if (sensitive) sections.push("law25-s12");
  if (sink === "llm") sections.push("owasp-llm02", "opc-genai");
  if (cats.some((c) => c.id === "health")) sections.push(...HEALTH_SECTIONS);

  let severity: Severity = "medium";
  if (sensitive || (thirdParty && sink !== "url" && cats.length)) severity = "high";
  if (!cats.length && wholeRecord && sink === "log") severity = "low";

  return {
    rule: "personal-info-leak",
    severity,
    path,
    line,
    title: `Personal information sent to ${SINK_TEXT[sink]}`,
    body: paragraphs.join("\n\n"),
    sections,
    evidence: truncate(text),
  };
}
