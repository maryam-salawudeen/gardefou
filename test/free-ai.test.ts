import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPrompt, parseLenient, PROVIDER_DEFAULTS } from "../src/ai.js";
import { DEFAULT_CONFIG } from "../src/config.js";
import { parseDiff } from "../src/diff.js";
import { review } from "../src/review.js";
import { runRules } from "../src/rules/index.js";
import { loadVendors } from "../src/vendors.js";

const db = loadVendors();
const fixture = readFileSync(new URL("./fixtures/signup.diff", import.meta.url), "utf8");
const pia = { date: "2026-11-07" };

function answer(content: string, status = 200) {
  return vi.fn(async () =>
    new Response(JSON.stringify({ model: "openai/gpt-4.1", choices: [{ message: { content } }] }), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("GitHub Models", () => {
  it("sends the workflow token and applies the answer", async () => {
    const fetch = answer(
      JSON.stringify({
        verdicts: [{ index: 0, keep: false, severity: "low", body: "" }],
        additional: [],
        summary: "Adds three US vendors.",
      }),
    );
    vi.stubGlobal("fetch", fetch);

    const result = await review(fixture, {
      config: DEFAULT_CONFIG,
      db,
      ai: { provider: "github-models", apiKey: "ghs_test" },
      pia,
    });

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://models.github.ai/inference/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer ghs_test");
    expect(JSON.parse(init.body as string).model).toBe("openai/gpt-4.1");
    expect(result.ai).toMatchObject({ used: true, dropped: 1, model: "openai/gpt-4.1" });
    expect(result.summary).toBe("Adds three US vendors.");
  });

  it("explains a missing models permission and keeps the rule findings", async () => {
    vi.stubGlobal("fetch", answer("", 403));
    const result = await review(fixture, { config: DEFAULT_CONFIG, db, ai: { provider: "github-models", apiKey: "x" }, pia });
    expect(result.ai.error).toContain("models: read");
    expect(result.findings.length).toBeGreaterThan(5);
  });

  it("says when the free daily limit is used up", async () => {
    vi.stubGlobal("fetch", answer("", 429));
    const result = await review(fixture, { config: DEFAULT_CONFIG, db, ai: { provider: "github-models", apiKey: "x" }, pia });
    expect(result.ai.error).toMatch(/daily limit/);
  });

  it("keeps the prompt inside the free tier's input limit", () => {
    const files = parseDiff(fixture);
    // Make the diff far larger than the budget.
    const big = files.map((f) => ({ ...f, patch: f.patch.repeat(40) }));
    const findings = runRules(files, db, DEFAULT_CONFIG);
    const { user } = buildPrompt(big, findings, DEFAULT_CONFIG.laws, PROVIDER_DEFAULTS["github-models"], true);
    // About 4 characters a token; the system prompt adds roughly 1,000 tokens.
    expect(user.length / 4).toBeLessThan(6500);
    expect(user).toContain("[cut to fit the size limit]");
  });
});

describe("Ollama", () => {
  it("calls the local server without a token", async () => {
    const fetch = answer(JSON.stringify({ verdicts: [], additional: [], summary: "ok" }));
    vi.stubGlobal("fetch", fetch);
    await review(fixture, { config: DEFAULT_CONFIG, db, ai: { provider: "ollama" }, pia });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://localhost:11434/v1/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBeUndefined();
  });
});

describe("answers from smaller models", () => {
  it("reads JSON wrapped in a code fence and keeps the valid entries", () => {
    const out = parseLenient(
      '```json\n{"verdicts":[{"index":0,"keep":true,"severity":"high","body":"ok"},{"index":"x"}],"additional":[{"path":"a.ts"}],"summary":"s"}\n```',
    );
    expect(out.verdicts).toHaveLength(1);
    expect(out.additional).toEqual([]);
    expect(out.summary).toBe("s");
  });

  it("finds the JSON when the model adds text around it", () => {
    expect(parseLenient('Here you go: {"verdicts":[],"additional":[],"summary":"none"} Thanks').summary).toBe("none");
  });

  it("never lets a model dismiss a leaked key", async () => {
    const key = "sk-ant-" + "api03-" + "a1B2c3D4e5F6g7H8i9J0kLmNoPqRsTuVwXyZ";
    const diff = ["diff --git a/k.ts b/k.ts", "new file mode 100644", "--- /dev/null", "+++ b/k.ts", "@@ -0,0 +1,1 @@", `+const k = "${key}";`, ""].join("\n");
    const fetch = answer(JSON.stringify({ verdicts: [{ index: 0, keep: false, severity: "low", body: "placeholder" }], additional: [], summary: "" }));
    vi.stubGlobal("fetch", fetch);
    const result = await review(diff, { config: DEFAULT_CONFIG, db, ai: { provider: "ollama" }, pia });
    expect(result.findings.some((f) => f.rule === "ai-secret")).toBe(true);
    // And the key never reached the model.
    expect((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body).not.toContain(key);
  });
});
