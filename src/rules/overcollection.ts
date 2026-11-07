import type { DiffFile, Finding, Severity } from "../types.js";
import { isComment, truncate } from "./util.js";

interface Check {
  id: string;
  pattern: RegExp;
  severity: Severity;
  title: string;
  body: string;
  sections: string[];
}

const CHECKS: Check[] = [
  {
    id: "sentry-default-pii",
    pattern: /\bsendDefaultPii\s*:\s*true|\bsend_default_pii\s*=\s*True/,
    severity: "medium",
    title: "Error reports will include personal information",
    body: "With this setting, every error report carries the person's IP address, cookies, request headers and logged-in user. Leave it off and attach only an internal user id where you need one.",
    sections: ["law25-s4", "pipeda-4.4", "pipa-ab-s11", "pipa-bc-s11"],
  },
  {
    id: "replay-unmasked",
    pattern: /\b(?:maskAllText|maskAllInputs|maskInputs|blockAllMedia)\s*:\s*false|\bmask_all_(?:text|inputs)\s*=\s*False/,
    severity: "high",
    title: "Session replay will record what people type and see",
    body: "Turning masking off means replays capture form inputs and on-screen text, which can include passwords, health details and payment information. Keep masking on and unmask specific safe elements instead.",
    sections: ["law25-s4", "law25-s8.1", "law25-s10", "pipeda-4.4", "pipeda-4.7"],
  },
  {
    id: "ip-not-anonymized",
    pattern: /\banonymi[sz]e_?ip\s*:\s*false|\bip_?anonymi[sz]ation\s*:\s*false/i,
    severity: "medium",
    title: "Full IP addresses will be collected",
    body: "An IP address can locate and identify a person. Keep anonymization on unless the purpose needs the full address.",
    sections: ["law25-s4", "law25-s8.1", "pipeda-4.4"],
  },
  {
    id: "always-profile",
    pattern: /\bperson_profiles\s*:\s*["']always["']/,
    severity: "low",
    title: "Profiles will be created for anonymous visitors",
    body: "This builds a profile for every visitor, including people who never sign in. `identified_only` limits profiles to people who have an account.",
    sections: ["law25-s4", "law25-s8.1", "pipeda-4.4"],
  },
  {
    id: "geolocation",
    pattern: /\bnavigator\.geolocation\.(?:getCurrentPosition|watchPosition)\s*\(|\bLocation\.(?:requestForegroundPermissionsAsync|requestBackgroundPermissionsAsync|watchPositionAsync)\s*\(/,
    severity: "medium",
    title: "Collects the person's location",
    body: "Location identifies and tracks people. Ask only when the feature needs it, explain why at that moment, and round or drop coordinates you don't need.",
    sections: ["law25-s8.1", "law25-s4", "pipeda-4.3", "pipeda-4.4"],
  },
  {
    id: "fingerprinting",
    pattern: /["']@fingerprintjs\/fingerprintjs(?:-pro)?["']|\bFingerprintJS\.load\s*\(/,
    severity: "high",
    title: "Adds browser fingerprinting",
    body: "Fingerprinting identifies people without a cookie they can clear, so it can't be turned off the way Law 25 s. 8.1 expects. If it's for fraud prevention, document that purpose and limit it to the flows that need it.",
    sections: ["law25-s8.1", "law25-s4", "pipeda-4.3", "pipeda-4.4"],
  },
];

/** Flags settings that collect more than the feature needs. */
export function overCollection(files: DiffFile[]): Finding[] {
  const findings: Finding[] = [];
  for (const file of files) {
    const seen = new Set<string>();
    for (const { line, text } of file.added) {
      if (isComment(text)) continue;
      for (const check of CHECKS) {
        if (seen.has(check.id) || !check.pattern.test(text)) continue;
        seen.add(check.id);
        findings.push({
          rule: "over-collection",
          severity: check.severity,
          path: file.path,
          line,
          title: check.title,
          body: check.body,
          sections: check.sections,
          evidence: truncate(text),
        });
      }
    }
  }
  return findings;
}
