import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, parseConfig, type Config } from "../src/config.js";
import { parseDiff } from "../src/diff.js";
import { inlineComment } from "../src/format.js";
import { redact } from "../src/redact.js";
import { runRules } from "../src/rules/index.js";
import { loadVendors } from "../src/vendors.js";

const db = loadVendors();

function diffOf(path: string, lines: string[], status: "new" | "modified" = "new"): string {
  return [
    `diff --git a/${path} b/${path}`,
    ...(status === "new" ? ["new file mode 100644", "--- /dev/null"] : [`--- a/${path}`]),
    `+++ b/${path}`,
    `@@ -0,0 +1,${lines.length} @@`,
    ...lines.map((l) => "+" + l),
    "",
  ].join("\n");
}

function rules(path: string, lines: string[], config: Config = DEFAULT_CONFIG) {
  return runRules(parseDiff(diffOf(path, lines)), db, config);
}

const only = (path: string, lines: string[], rule: string, config?: Config) =>
  rules(path, lines, config).filter((f) => f.rule === rule);

// Built at runtime so this file doesn't trip secret scanners.
const FAKE_ANTHROPIC_KEY = "sk-ant-" + "api03-" + "a1B2c3D4e5F6g7H8i9J0kLmNoPqRsTuVwXyZ";

describe("secrets", () => {
  it("flags a hard-coded AI key and never quotes it", () => {
    const [f] = only("src/ai.ts", [`const client = new Anthropic({ apiKey: "${FAKE_ANTHROPIC_KEY}" });`], "ai-secret");
    expect(f?.severity).toBe("high");
    expect(f!.evidence).not.toContain(FAKE_ANTHROPIC_KEY);
    expect(inlineComment(f!, DEFAULT_CONFIG)).not.toContain(FAKE_ANTHROPIC_KEY);
  });

  it("flags keys that ship to the browser", () => {
    expect(only("src/env.ts", ["const key = process.env.NEXT_PUBLIC_OPENAI_API_KEY;"], "ai-secret")).toHaveLength(1);
    expect(only("src/ai.ts", ["const openai = new OpenAI({ dangerouslyAllowBrowser: true });"], "ai-secret")).toHaveLength(1);
  });

  it("leaves server-side environment variables alone", () => {
    expect(only("src/ai.ts", ["const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });"], "ai-secret")).toEqual([]);
  });
});

describe("prompt injection", () => {
  it("flags request data in the system prompt", () => {
    const [f] = only("src/chat.ts", ["  system: `You are a support agent for ${req.body.company}.`,"], "prompt-injection");
    expect(f?.title).toMatch(/Untrusted input/);
    expect(f?.sections).toContain("owasp-llm01");
  });

  it("flags secrets in the system prompt", () => {
    const [f] = only("src/chat.ts", ["  system: `Use admin token ${process.env.ADMIN_TOKEN} for lookups`,"], "prompt-injection");
    expect(f?.sections).toContain("owasp-llm07");
  });

  it("leaves a fixed system prompt alone", () => {
    expect(only("src/chat.ts", ['  system: "You answer billing questions.",'], "prompt-injection")).toEqual([]);
  });
});

describe("model output", () => {
  it("flags output passed to a shell, eval or HTML", () => {
    expect(only("src/agent.ts", ["execSync(completion.choices[0].message.content);"], "ai-output")).toHaveLength(1);
    expect(only("src/Answer.tsx", ["<div dangerouslySetInnerHTML={{ __html: aiResponse }} />"], "ai-output")).toHaveLength(1);
    expect(only("src/q.ts", ["await prisma.$queryRawUnsafe(llmOutput);"], "ai-output")).toHaveLength(1);
  });

  it("leaves rendering plain text alone", () => {
    expect(only("src/Answer.tsx", ["<p>{aiResponse}</p>"], "ai-output")).toEqual([]);
  });
});

describe("agent permissions", () => {
  it("flags Claude Code bypassing permissions", () => {
    const found = only(".claude/settings.json", ['{ "permissions": { "defaultMode": "bypassPermissions" } }'], "ai-agency");
    expect(found[0]?.severity).toBe("high");
  });

  it("flags broad shell access in an allow list, but not in a deny list", () => {
    const allow = only(".claude/settings.json", ['  "permissions": {', '    "allow": [', '      "Bash(curl:*)",', "    ]"], "ai-agency");
    expect(allow).toHaveLength(1);
    const deny = only(".claude/settings.json", ['  "permissions": {', '    "deny": [', '      "Bash(curl:*)",', "    ]"], "ai-agency");
    expect(deny).toEqual([]);
  });

  it("flags Codex running with no approvals and full access", () => {
    expect(only(".codex/config.toml", ['approval_policy = "never"', 'sandbox_mode = "danger-full-access"'], "ai-agency")).toHaveLength(1);
  });

  it("flags unpinned MCP servers and accepts pinned ones", () => {
    const unpinned = only(".mcp.json", ['    "command": "npx",', '    "args": ["-y", "@modelcontextprotocol/server-github"]'], "ai-agency");
    expect(unpinned[0]?.title).toMatch(/unpinned/);
    const pinned = only(".mcp.json", ['    "command": "npx",', '    "args": ["-y", "@modelcontextprotocol/server-github@2025.4.8"]'], "ai-agency");
    expect(pinned).toEqual([]);
  });

  it("flags tools that let a model act in application code", () => {
    expect(only("src/agent.ts", ['  { name: "send_payment", description: "Send money", input_schema }'], "ai-agency")).toHaveLength(1);
    expect(only("src/agent.ts", ['tools: [{ type: "bash_20250124", name: "bash" }],'], "ai-agency")).toHaveLength(1);
  });

  it("flags an AI agent in CI that anyone can trigger", () => {
    const found = only(".github/workflows/claude.yml", [
      "on:",
      "  issue_comment:",
      "    types: [created]",
      "jobs:",
      "  claude:",
      "    steps:",
      "      - uses: anthropics/claude-code-action@v1",
    ], "ai-agency");
    expect(found[0]?.title).toMatch(/outside users/);
  });

  it("leaves an AI agent on a trusted trigger alone", () => {
    expect(only(".github/workflows/claude.yml", ["on:", "  workflow_dispatch:", "jobs:", "  x:", "    steps:", "      - uses: anthropics/claude-code-action@v1"], "ai-agency")).toEqual([]);
  });
});

describe("AI policy", () => {
  const policy = parseConfig("ai:\n  approved_providers: [anthropic]\n  require_canadian_region: true\n");

  it("raises an unapproved AI provider as a policy violation", () => {
    const [f] = rules("src/ai.ts", ['import OpenAI from "openai";'], policy);
    expect(f?.rule).toBe("ai-provider");
    expect(f?.severity).toBe("high");
  });

  it("treats an approved provider as covered", () => {
    expect(rules("src/ai.ts", ['import Anthropic from "@anthropic-ai/sdk";'], policy)).toEqual([]);
  });

  it("flags an AI client pointed outside Canada when the policy requires Canada", () => {
    const found = only("src/ai.ts", ["const client = new BedrockRuntimeClient({", '  region: "us-east-1",', "});"], "ai-provider", policy);
    expect(found).toHaveLength(1);
    expect(only("src/ai.ts", ["const client = new BedrockRuntimeClient({", '  region: "ca-central-1",', "});"], "ai-provider", policy)).toEqual([]);
  });

  it("flags asking the provider to store conversations", () => {
    expect(only("src/ai.ts", ["  store: true,"], "ai-retention")).toHaveLength(1);
  });
});

describe("automated decisions", () => {
  it("flags a model asked to decide about a person", () => {
    const found = only("src/screen.ts", [
      "const prompt = `Read this résumé and decide whether to reject the candidate.`;",
      "const res = await client.messages.create({ model, messages: [{ role: \"user\", content: prompt }] });",
    ], "automated-decision");
    expect(found[0]?.sections).toContain("law25-s12.1");
  });

  it("leaves other prompts alone", () => {
    expect(only("src/sum.ts", ["const res = await client.messages.create({ model, messages: [{ role: \"user\", content: summarize(doc) }] });"], "automated-decision")).toEqual([]);
  });
});

describe("redact", () => {
  it("removes secrets and personal values", () => {
    const { text, count } = redact(`key=${FAKE_ANTHROPIC_KEY} mail jane@example.ca sin 046 454 286 card 4111 1111 1111 1111`);
    expect(text).not.toContain(FAKE_ANTHROPIC_KEY);
    expect(text).not.toContain("jane@example.ca");
    expect(text).not.toContain("046 454 286");
    expect(text).not.toContain("4111 1111 1111 1111");
    expect(count).toBe(4);
  });

  it("keeps secrets out but personal values in when asked", () => {
    const { text } = redact(`${FAKE_ANTHROPIC_KEY} jane@example.ca`, false);
    expect(text).toContain("jane@example.ca");
    expect(text).not.toContain(FAKE_ANTHROPIC_KEY);
  });

  it("leaves ordinary numbers alone", () => {
    expect(redact("const timeoutMs = 1234567890123;").count).toBe(0);
  });
});
