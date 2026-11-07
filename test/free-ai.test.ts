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
const ANSWER = JSON.stringify({
  verdicts: [{ index: 0, keep: false, severity: "low", body: "" }],
  additional: [],
  summary: "Adds three US vendors.",
});

function respond(json: unknown, status = 200) {
  return vi.fn(async () => new Response(typeof json === "string" ? json : JSON.stringify(json), { status }));
}
const call = (fetch: ReturnType<typeof respond>) => fetch.mock.calls[0] as unknown as [string, RequestInit];

afterEach(() => vi.unstubAllGlobals());

describe("Ollama", () => {
  it("uses the native API with a context large enough for the prompt", async () => {
    const fetch = respond({ model: "qwen2.5-coder:3b", message: { content: ANSWER } });
    vi.stubGlobal("fetch", fetch);
    const result = await review(fixture, { config: DEFAULT_CONFIG, db, ai: { provider: "ollama", model: "qwen2.5-coder:3b" }, pia });

    const [url, init] = call(fetch);
    expect(url).toBe("http://localhost:11434/api/chat");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ model: "qwen2.5-coder:3b", stream: false, format: "json" });
    expect(body.options.num_ctx).toBeGreaterThanOrEqual(16_000);
    expect((init.headers as Record<string, string>).authorization).toBeUndefined();
    expect(result.ai).toMatchObject({ used: true, dropped: 1, model: "qwen2.5-coder:3b" });
    expect(result.summary).toBe("Adds three US vendors.");
  });

  it("accepts the OpenAI-style /v1 address too", async () => {
    const fetch = respond({ message: { content: ANSWER } });
    vi.stubGlobal("fetch", fetch);
    await review(fixture, { config: DEFAULT_CONFIG, db, ai: { provider: "ollama", baseUrl: "http://127.0.0.1:11434/v1" }, pia });
    expect(call(fetch)[0]).toBe("http://127.0.0.1:11434/api/chat");
  });

  it("explains when Ollama isn't running and keeps the rule findings", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    const result = await review(fixture, { config: DEFAULT_CONFIG, db, ai: { provider: "ollama" }, pia });
    expect(result.ai.error).toMatch(/ollama serve/);
    expect(result.findings.length).toBeGreaterThan(5);
  });

  it("says to pull a missing model", async () => {
    vi.stubGlobal("fetch", respond('{"error":"model not found"}', 404));
    const result = await review(fixture, { config: DEFAULT_CONFIG, db, ai: { provider: "ollama" }, pia });
    expect(result.ai.error).toMatch(/ollama pull/);
  });

  it("keeps the prompt small enough for a local model", () => {
    const files = parseDiff(fixture);
    const big = files.map((f) => ({ ...f, patch: f.patch.repeat(40) }));
    const findings = runRules(files, db, DEFAULT_CONFIG);
    const { user } = buildPrompt(big, findings, DEFAULT_CONFIG.laws, PROVIDER_DEFAULTS.ollama, true);
    // About 4 characters a token; with the system prompt this stays well under the context.
    expect(user.length / 4).toBeLessThan(7000);
    expect(user).toContain("[cut to fit the size limit]");
  });
});

describe("OpenAI-compatible servers", () => {
  it("sends the key and the JSON response format", async () => {
    const fetch = respond({ model: "some-model", choices: [{ message: { content: ANSWER } }] });
    vi.stubGlobal("fetch", fetch);
    const result = await review(fixture, {
      config: DEFAULT_CONFIG,
      db,
      ai: { provider: "openai-compatible", baseUrl: "http://localhost:1234/v1/", model: "some-model", apiKey: "k" },
      pia,
    });
    const [url, init] = call(fetch);
    expect(url).toBe("http://localhost:1234/v1/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer k");
    expect(JSON.parse(init.body as string).response_format).toEqual({ type: "json_object" });
    expect(result.ai.used).toBe(true);
  });

  it("requires a server and a model", async () => {
    const result = await review(fixture, { config: DEFAULT_CONFIG, db, ai: { provider: "openai-compatible" }, pia });
    expect(result.ai.error).toMatch(/server URL and a model/);
  });

  it("recognises a retired service that answers with plain text", async () => {
    vi.stubGlobal("fetch", respond("OK"));
    const result = await review(fixture, {
      config: DEFAULT_CONFIG,
      db,
      ai: { provider: "openai-compatible", baseUrl: "https://retired.example/v1", model: "m" },
      pia,
    });
    expect(result.ai.error).toMatch(/moved or been retired/);
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

  it("never lets a model dismiss a leaked key, and never sends it the key", async () => {
    const key = "sk-ant-" + "api03-" + "a1B2c3D4e5F6g7H8i9J0kLmNoPqRsTuVwXyZ";
    const diff = ["diff --git a/k.ts b/k.ts", "new file mode 100644", "--- /dev/null", "+++ b/k.ts", "@@ -0,0 +1,1 @@", `+const k = "${key}";`, ""].join("\n");
    const fetch = respond({
      message: { content: JSON.stringify({ verdicts: [{ index: 0, keep: false, severity: "low", body: "placeholder" }], additional: [], summary: "" }) },
    });
    vi.stubGlobal("fetch", fetch);
    const result = await review(diff, { config: DEFAULT_CONFIG, db, ai: { provider: "ollama" }, pia });
    expect(result.findings.some((f) => f.rule === "ai-secret")).toBe(true);
    expect(call(fetch)[1].body).not.toContain(key);
  });
});
