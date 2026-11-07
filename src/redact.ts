// Secrets and personal information are removed from anything this tool sends
// or posts: the diff sent to the AI pass, and the evidence quoted in comments.
// A privacy reviewer that leaked a key into a pull request comment would be
// the problem it is meant to catch.

export interface SecretPattern {
  id: string;
  label: string;
  pattern: RegExp;
  /** AI provider keys get their own finding wording. */
  ai?: boolean;
}

export const SECRET_PATTERNS: SecretPattern[] = [
  { id: "anthropic", label: "Anthropic API key", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}/g, ai: true },
  { id: "openai", label: "OpenAI API key", pattern: /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{32,}/g, ai: true },
  { id: "google", label: "Google API key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g, ai: true },
  { id: "huggingface", label: "Hugging Face token", pattern: /\bhf_[A-Za-z0-9]{30,}\b/g, ai: true },
  { id: "aws", label: "AWS access key", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { id: "github", label: "GitHub token", pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/g },
  { id: "slack", label: "Slack token", pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g },
  { id: "stripe", label: "Stripe live key", pattern: /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b/g },
  { id: "private-key", label: "private key", pattern: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/g },
  { id: "jwt", label: "JSON web token", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  {
    id: "assigned-secret",
    label: "hard-coded secret",
    pattern: /\b(?:api[_-]?key|secret|token|password|passwd)["']?\s*[:=]\s*["'](?![^"']*\$\{)[^"'\s]{16,}["']/gi,
  },
];

// Values that are personal information on their own, wherever they appear.
const PERSONAL_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: "email", pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  // A SIN is nine digits, usually grouped 3-3-3.
  { label: "SIN", pattern: /\b\d{3}[ -]\d{3}[ -]\d{3}\b/g },
  { label: "phone", pattern: /(?<![\w.])(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b/g },
  { label: "card number", pattern: /\b(?:\d[ -]?){13,19}\b/g },
];

export interface Redaction {
  text: string;
  count: number;
}

export function redact(text: string, personal = true): Redaction {
  let count = 0;
  let out = text;
  for (const { id, pattern } of SECRET_PATTERNS) {
    out = out.replace(pattern, (match) => {
      count++;
      // Keep the left side of an assignment so the reader can still see what was set.
      if (id === "assigned-secret") return match.replace(/["'][^"']+["']$/, '"[REDACTED]"');
      return `[REDACTED ${id}]`;
    });
  }
  if (personal) {
    for (const { label, pattern } of PERSONAL_PATTERNS) {
      out = out.replace(pattern, (match) => {
        if (label === "card number" && !luhn(match)) return match;
        count++;
        return `[REDACTED ${label}]`;
      });
    }
  }
  return { text: out, count };
}

function luhn(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 13) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}
