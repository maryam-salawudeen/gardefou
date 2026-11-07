import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

// The real API isn't called in tests. The mock returns what the model would.
const parse = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    beta = { messages: { parse } };
  },
}));

const { DEFAULT_CONFIG } = await import("../src/config.js");
const { review } = await import("../src/review.js");
const { loadVendors } = await import("../src/vendors.js");

const fixture = readFileSync(new URL("./fixtures/signup.diff", import.meta.url), "utf8");
const opts = { config: DEFAULT_CONFIG, db: loadVendors(), ai: { apiKey: "test" }, pia: { date: "2026-11-07" } };

describe("AI pass", () => {
  it("applies verdicts and keeps only additions that point at added lines", async () => {
    parse.mockResolvedValueOnce({
      model: "claude-opus-5-5",
      stop_reason: "end_turn",
      parsed_output: {
        verdicts: [{ index: 0, keep: false, severity: "low", body: "" }],
        additional: [
          { path: "src/app/signup/route.ts", line: 12, rule: "personal-info-leak", severity: "medium", title: "Whole request body saved", body: "Saves every field.", sections: ["law25-s4", "made-up"] },
          { path: "src/app/signup/route.ts", line: 999, rule: "personal-info-leak", severity: "high", title: "Not in diff", body: "x", sections: ["law25-s4"] },
          { path: "src/app/signup/route.ts", line: 12, rule: "personal-info-leak", severity: "high", title: "No real citation", body: "x", sections: ["made-up"] },
        ],
        summary: "Adds three US vendors and stores a SIN.",
      },
    });

    const rulesOnly = await review(fixture, { ...opts, ai: null });
    const result = await review(fixture, opts);

    expect(result.ai).toMatchObject({ used: true, dropped: 1, added: 1 });
    expect(result.findings).toHaveLength(rulesOnly.findings.length);
    const added = result.findings.find((f) => f.title === "Whole request body saved")!;
    expect(added.sections).toEqual(["law25-s4"]);
    expect(added.evidence).toContain("db.user.create");
    expect(result.summary).toBe("Adds three US vendors and stores a SIN.");

    const request = parse.mock.calls[0]![0];
    expect(request.model).toBe("claude-opus-5-5");
    expect(request.fallbacks).toBe("default");
    expect(request.messages[0].content).toContain("<diff>");
  });

  it("falls back to the rule findings when the API call fails", async () => {
    parse.mockRejectedValueOnce(new Error("rate limited"));
    const result = await review(fixture, opts);
    expect(result.ai).toMatchObject({ used: false, error: "rate limited" });
    expect(result.findings.length).toBeGreaterThan(0);
  });
});
