export type Severity = "high" | "medium" | "low";

export const SEVERITY_RANK: Record<Severity, number> = { high: 3, medium: 2, low: 1 };

export const PROVINCES = ["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"] as const;
export type Province = (typeof PROVINCES)[number];

export type Law =
  | "law25"
  | "pipeda"
  | "pipa-ab"
  | "pipa-bc"
  | "health-qc"
  | "health-on"
  | "health-ab"
  | "health-sk"
  | "health-mb"
  | "health-nb"
  | "health-ns"
  | "health-nl"
  | "health-pe"
  | "health-yt"
  | "health-nt";

export const RULE_IDS = [
  "new-recipient",
  "personal-info-field",
  "personal-info-leak",
  "over-collection",
  "ai-secret",
  "ai-provider",
  "ai-retention",
  "prompt-injection",
  "ai-output",
  "ai-agency",
  "automated-decision",
] as const;
export type RuleId = (typeof RULE_IDS)[number];

export interface AddedLine {
  /** Line number in the new version of the file. */
  line: number;
  text: string;
}

export interface DiffFile {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  added: AddedLine[];
  /** Hunk headers and bodies as they appear in the diff, kept for the AI pass. */
  patch: string;
}

export interface Vendor {
  id: string;
  name: string;
  operator: string;
  website: string;
  privacyUrl?: string;
  category: string;
  domains: string[];
  /** Package names that load this vendor's SDK, by ecosystem. */
  packages?: { npm?: string[]; pypi?: string[] };
  hq: { country: string; region?: string } | null;
  profiling?: boolean;
  note?: string;
}

export interface Finding {
  rule: RuleId;
  severity: Severity;
  path: string;
  line: number;
  title: string;
  body: string;
  /** Section ids from law.ts. */
  sections: string[];
  vendor?: Vendor;
  /** The line that triggered the finding, with secrets redacted. */
  evidence: string;
}

export interface ReviewResult {
  findings: Finding[];
  summary: string;
  piaDrafts: { vendor: Vendor; markdown: string }[];
  ai: { used: boolean; model?: string; dropped: number; added: number; redacted: number; error?: string };
}
