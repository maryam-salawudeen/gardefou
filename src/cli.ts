import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { CONFIG_FILE, loadConfig } from "./config.js";
import { summaryComment, terminalReport } from "./format.js";
import { AI_PROVIDERS, type AiProvider } from "./ai.js";
import { review, shouldFail, type ReviewOptions } from "./review.js";
import type { Severity } from "./types.js";
import { loadVendors } from "./vendors.js";

const HELP = `Usage: gardefou [options]

Reviews a diff for personal information under Canadian privacy law, and for unsafe use of AI.
With no --diff, it compares your working tree with where it branched from --base.

Options:
  --base <ref>       Branch to compare with (default: main)
  --diff <file>      Read a unified diff from a file, or "-" for stdin
  --format <fmt>     text (default), markdown or json
  --ai <provider>    Have an AI model check each finding in context:
                       ollama             a model on this machine (free; nothing leaves it)
                       openai-compatible  any OpenAI-compatible server (needs --ai-url and
                                          --model; reads AI_API_KEY if it needs a key)
                       anthropic          Claude (needs ANTHROPIC_API_KEY; costs API credits)
  --model <id>       Model for --ai (defaults: ollama qwen2.5-coder:7b, anthropic claude-opus-5-5)
  --ai-url <url>     Server for ollama (default http://localhost:11434) or openai-compatible,
                     for example LM Studio at http://localhost:1234/v1
  --pia-dir <dir>    Write privacy impact assessment drafts here
  --fail-on <level>  Exit with code 1 at this severity or above: high, medium, low
  --config <file>    Config file (default: ${CONFIG_FILE})
  -h, --help         Show this help
`;

async function main() {
  const { values } = parseArgs({
    options: {
      base: { type: "string", default: "main" },
      diff: { type: "string" },
      format: { type: "string", default: "text" },
      ai: { type: "string" },
      model: { type: "string" },
      "ai-url": { type: "string" },
      "pia-dir": { type: "string" },
      "fail-on": { type: "string" },
      config: { type: "string", default: CONFIG_FILE },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) return void process.stdout.write(HELP);

  const config = loadConfig(values.config);
  if (values["fail-on"]) {
    if (!["high", "medium", "low"].includes(values["fail-on"])) throw new Error("--fail-on must be high, medium or low.");
    config.failOn = values["fail-on"] as Severity;
  }

  const diff =
    values.diff === "-"
      ? readFileSync(0, "utf8")
      : values.diff
        ? readFileSync(values.diff, "utf8")
        : execFileSync("git", ["diff", "--merge-base", values.base!], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

  const result = await review(diff, {
    config,
    db: loadVendors(),
    ai: aiOptions(values.ai, values.model, values["ai-url"]),
    pia: { date: new Date().toISOString().slice(0, 10) },
    log: (msg) => process.stderr.write(msg + "\n"),
  });

  if (values.format === "json") {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else if (values.format === "markdown") {
    process.stdout.write(summaryComment(result, config, result.findings.length) + "\n");
  } else {
    process.stdout.write(terminalReport(result, config) + "\n");
  }

  if (values["pia-dir"] && result.piaDrafts.length) {
    mkdirSync(values["pia-dir"], { recursive: true });
    for (const d of result.piaDrafts) writeFileSync(join(values["pia-dir"], `pia-${d.vendor.id}.md`), d.markdown);
    process.stderr.write(`Wrote ${result.piaDrafts.length} PIA draft(s) to ${values["pia-dir"]}\n`);
  }

  if (shouldFail(result.findings, config)) process.exitCode = 1;
}

function aiOptions(provider: string | undefined, model?: string, baseUrl?: string): ReviewOptions["ai"] {
  if (!provider) return null;
  if (!(AI_PROVIDERS as string[]).includes(provider)) {
    throw new Error(`--ai must be one of ${AI_PROVIDERS.join(", ")}.`);
  }
  if (provider === "openai-compatible" && (!baseUrl || !model)) {
    throw new Error("--ai openai-compatible needs --ai-url and --model.");
  }
  return {
    provider: provider as AiProvider,
    // Anthropic reads its key from the environment itself.
    apiKey: provider === "openai-compatible" ? process.env.AI_API_KEY : undefined,
    model,
    baseUrl,
  };
}

main().catch((err) => {
  process.stderr.write(`gardefou: ${err instanceof Error ? err.message : err}\n`);
  process.exitCode = 2;
});
