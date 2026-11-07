import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, parseConfig } from "../src/config.js";
import { parseDiff } from "../src/diff.js";
import { cite, isSectionId } from "../src/law.js";
import { review, shouldFail } from "../src/review.js";
import { categoryOf } from "../src/rules/pi.js";
import { runRules } from "../src/rules/index.js";
import { loadVendors } from "../src/vendors.js";

const db = loadVendors();
const fixture = readFileSync(new URL("./fixtures/signup.diff", import.meta.url), "utf8");

/** Builds a one-file diff from added lines. */
function diffOf(path: string, lines: string[]): string {
  return [
    `diff --git a/${path} b/${path}`,
    "new file mode 100644",
    "--- /dev/null",
    `+++ b/${path}`,
    `@@ -0,0 +1,${lines.length} @@`,
    ...lines.map((l) => "+" + l),
    "",
  ].join("\n");
}

function rules(path: string, lines: string[], config = DEFAULT_CONFIG) {
  return runRules(parseDiff(diffOf(path, lines)), db, config);
}

describe("parseDiff", () => {
  it("keeps new-file line numbers for added lines only", () => {
    const files = parseDiff(fixture);
    const schema = files.find((f) => f.path === "prisma/schema.prisma")!;
    expect(schema.added.map((a) => a.line)).toEqual([3, 4, 5, 6, 7]);
    expect(schema.added[0]!.text).toContain("email");
    expect(files.find((f) => f.path === "src/app/signup/route.ts")!.status).toBe("added");
  });
});

describe("new recipients", () => {
  it("finds vendors from dependencies, imports and endpoints, once each", () => {
    const vendors = runRules(parseDiff(fixture), db, DEFAULT_CONFIG)
      .filter((f) => f.rule === "new-recipient")
      .map((f) => f.vendor!.id)
      .sort();
    expect(vendors).toEqual(["openai", "posthog", "sentry"]);
  });

  it("ignores packages that aren't vendors", () => {
    expect(rules("package.json", ['    "zod": "^3.0.0",', '    "build": "tsc"'])).toEqual([]);
  });

  it("reads Python manifests and imports", () => {
    expect(rules("requirements.txt", ["sentry-sdk[flask]>=2.0"])[0]?.vendor?.id).toBe("sentry");
    expect(rules("app/ai.py", ["from anthropic import Anthropic"])[0]?.vendor?.id).toBe("anthropic");
  });

  it("skips vendors listed as approved", () => {
    const config = parseConfig("vendors:\n  approved:\n    - id: stripe\n      pia: docs/pia/stripe.md\n");
    expect(rules("src/pay.ts", ['import Stripe from "stripe";'], config)).toEqual([]);
  });

  it("rates a Québec vendor low and an Ontario one higher", () => {
    expect(rules("src/search.ts", ['await fetch("https://platform.cloud.coveo.com/rest/search")'])[0]?.severity).toBe("low");
    expect(rules("src/pay.ts", ['await fetch("https://api.moneris.com/charge")'])[0]?.severity).toBe("medium");
  });

  it("ignores links in comments", () => {
    expect(rules("src/a.ts", ["// docs: https://posthog.com/docs"])).toEqual([]);
  });
});

describe("personal information fields", () => {
  it("recognises field names in several naming styles", () => {
    expect(categoryOf("dateOfBirth")?.id).toBe("birth-date");
    expect(categoryOf("patient_dob")?.id).toBe("birth-date");
    expect(categoryOf("SocialInsuranceNumber")?.id).toBe("government-id");
    expect(categoryOf("healthCardNumber")?.id).toBe("government-id");
    expect(categoryOf("sin")?.id).toBe("government-id");
    expect(categoryOf("single")).toBeNull();
    expect(categoryOf("trace")).toBeNull();
  });

  it("flags sensitive fields anywhere and contact fields only in schemas", () => {
    expect(rules("src/types.ts", ["  diagnosis: string;"])[0]?.severity).toBe("high");
    expect(rules("src/types.ts", ["  email: string;"])).toEqual([]);
    expect(rules("db/migrations/001.sql", ["  email VARCHAR(255) NOT NULL,"])[0]?.rule).toBe("personal-info-field");
  });

  it("doesn't mistake Math.sin for a SIN", () => {
    expect(rules("src/geo.ts", ["const a = Math.sin(x);"])).toEqual([]);
  });

  it("groups fields of one category in a file into one finding", () => {
    const found = rules("prisma/schema.prisma", ["  sin String", "  passportNumber String", "  ramq String"]);
    expect(found).toHaveLength(1);
    expect(found[0]!.body).toContain("`passportNumber`");
  });
});

describe("leaks", () => {
  it("flags personal information in logs, analytics, URLs and prompts", () => {
    const rulesHit = runRules(parseDiff(fixture), db, DEFAULT_CONFIG)
      .filter((f) => f.rule === "personal-info-leak")
      .map((f) => f.line)
      .sort((a, b) => a - b);
    expect(rulesHit).toEqual([9, 11, 13, 19]);
  });

  it("doesn't flag logging an internal id", () => {
    expect(rules("src/a.ts", ['logger.info("created", user.id);'])).toEqual([]);
  });
});

describe("over-collection", () => {
  it("flags unmasked replay and default PII", () => {
    const found = rules("sentry.client.config.ts", ["  sendDefaultPii: true,", "  replayIntegration({ maskAllText: false })"]);
    expect(found.map((f) => f.severity).sort()).toEqual(["high", "medium"]);
  });
});

describe("citations", () => {
  it("cites only sections that exist", () => {
    for (const f of runRules(parseDiff(fixture), db, DEFAULT_CONFIG)) {
      expect(f.sections.length).toBeGreaterThan(0);
      for (const s of f.sections) expect(isSectionId(s), s).toBe(true);
    }
  });

  it("cites only the provinces in scope", async () => {
    const config = parseConfig("jurisdictions:\n  provinces: [ON]\n");
    expect(config.laws).toEqual(["pipeda"]);
    const result = await review(fixture, { config, db, pia: { date: "2026-11-07" } });
    const comments = result.findings.map((f) => cite(f.sections, config.laws)).join("\n");
    expect(comments).toContain("PIPEDA");
    expect(comments).not.toContain("PIPA");
    expect(comments).not.toContain("Law 25");
    expect(result.piaDrafts[0]!.markdown).toContain("PIPEDA Principle 4.1.3");
    expect(result.piaDrafts[0]!.markdown).not.toContain("s. 17");
  });

  it("adds health information acts only when health is on", () => {
    expect(parseConfig("jurisdictions:\n  provinces: [ON, QC]\n  health: true\n").laws.sort()).toEqual(
      ["health-on", "health-qc", "law25", "pipeda"],
    );
    expect(DEFAULT_CONFIG.laws.sort()).toEqual(["law25", "pipa-ab", "pipa-bc", "pipeda"]);
  });
});

describe("review", () => {
  it("drafts a PIA for each recipient outside Québec and respects fail_on", async () => {
    const config = parseConfig("fail_on: high\n");
    const result = await review(fixture, { config, db, pia: { date: "2026-11-07" } });
    expect(result.piaDrafts.map((d) => d.vendor.id).sort()).toEqual(["openai", "posthog", "sentry"]);
    expect(result.piaDrafts[0]!.markdown).toContain("s. 17");
    expect(shouldFail(result.findings, config)).toBe(true);
    expect(result.ai.used).toBe(false);
  });

  it("ignores Markdown files by default", async () => {
    const result = await review(fixture, { config: DEFAULT_CONFIG, db, pia: { date: "2026-11-07" } });
    expect(result.findings.some((f) => f.path === "README.md")).toBe(false);
  });

  it("stays quiet on a change with no personal information", async () => {
    const diff = diffOf("src/math.ts", ["export const add = (a: number, b: number) => a + b;"]);
    const result = await review(diff, { config: DEFAULT_CONFIG, db, pia: { date: "2026-11-07" } });
    expect(result.findings).toEqual([]);
  });
});
