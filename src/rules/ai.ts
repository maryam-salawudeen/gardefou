import { covers, type Config } from "../config.js";
import { redact, SECRET_PATTERNS } from "../redact.js";
import type { DiffFile, Finding, RuleId, Severity } from "../types.js";
import { isComment, truncate } from "./util.js";

// Guardrails for companies that build on AI or let AI agents work in their
// repositories. Each check is a boundary a security team would set: keys stay
// secret, untrusted text never becomes instructions, model output is never
// trusted as code, agents get only the power their task needs, and decisions
// about people keep a human in them.

const AI_CALL = /\b(?:messages\.(?:create|stream|parse)|chat\.completions\.create|responses\.create|generateText|streamText|generateObject|streamObject|generateContent|invoke_?model\w*|converse\w*|InvokeModel\w*|ChatCompletion\.create)\s*\(/i;
const AI_CLIENT = /\b(?:new\s+(?:Anthropic\w*|OpenAI|AzureOpenAI|GoogleGenAI|GoogleGenerativeAI|Mistral|CohereClient\w*|BedrockRuntimeClient)|AnthropicBedrock\w*|AnthropicVertex|anthropic\.Anthropic|openai\.OpenAI|VertexAI|ChatOpenAI|ChatAnthropic|bedrock-runtime|aiplatform)\b/;

export function aiGuardrails(files: DiffFile[], config: Config): Finding[] {
  const out: Finding[] = [];
  for (const file of files) {
    out.push(
      ...secrets(file),
      ...promptInjection(file),
      ...outputHandling(file),
      ...agency(file),
      ...ciAgents(file),
      ...retention(file),
      ...automatedDecisions(file, config),
    );
    if (config.ai.requireCanadianRegion) out.push(...region(file));
  }
  return out;
}

function finding(
  rule: RuleId,
  severity: Severity,
  file: DiffFile,
  line: number,
  text: string,
  title: string,
  body: string[],
  sections: string[],
): Finding {
  return { rule, severity, path: file.path, line, title, body: body.join("\n\n"), sections, evidence: truncate(redact(text).text) };
}

const SECURITY = ["law25-s10", "pipeda-4.7", "pipa-ab-s34", "pipa-bc-s34"];

// Keys in source code, or keys shipped to the browser where anyone can read them.
const BROWSER_KEY = /\b(?:NEXT_PUBLIC|VITE|REACT_APP|EXPO_PUBLIC|PUBLIC|NUXT_PUBLIC|GATSBY)_\w*(?:OPENAI|ANTHROPIC|CLAUDE|GEMINI|GOOGLE_AI|MISTRAL|COHERE|GROQ|HUGGING\w*|AI)_?\w*KEY\b/;

function secrets(file: DiffFile): Finding[] {
  const out: Finding[] = [];
  for (const { line, text } of file.added) {
    const hit = SECRET_PATTERNS.find((p) => new RegExp(p.pattern.source, p.pattern.flags.replace("g", "")).test(text));
    if (hit) {
      out.push(
        finding("ai-secret", "high", file, line, text, `Hard-coded ${hit.label}`, [
          `This line contains what looks like a ${hit.label}. Anyone who can read the repository, its history or its forks can use it, and removing it in a later commit doesn't take it out of the history.`,
          "Revoke it now, then load it from a secret manager or an environment variable that isn't committed.",
          ...(hit.ai ? ["A leaked AI key also lets someone run up your bill and read what your account sends and stores."] : []),
        ], [...SECURITY, "cccs-genai"]),
      );
      continue;
    }
    if (isComment(text)) continue;
    if (BROWSER_KEY.test(text)) {
      out.push(
        finding("ai-secret", "high", file, line, text, "AI API key exposed to the browser", [
          "Variables with this prefix are bundled into the JavaScript every visitor downloads, so the key is public.",
          "Call the AI provider from your server and keep the key there.",
        ], [...SECURITY, "cccs-genai"]),
      );
    } else if (/\bdangerouslyAllowBrowser\s*:\s*true\b/.test(text)) {
      out.push(
        finding("ai-secret", "high", file, line, text, "AI client runs in the browser", [
          "`dangerouslyAllowBrowser` lets the SDK run client-side, which means the API key is sent to every visitor.",
          "Move the call to your server, or use short-lived, narrowly scoped credentials if the provider offers them.",
        ], [...SECURITY, "cccs-genai"]),
      );
    }
  }
  return out;
}

// A system prompt is the instructions. Building it from request data hands
// those instructions to whoever sends the request.
const SYSTEM_SLOT = /\b(?:system|systemPrompt|system_prompt|systemInstruction|system_instruction|instructions|preamble)["']?\s*[:=]/;
const UNTRUSTED = /\b(?:req|request|ctx\.request|body|params|query|input|userInput|user_input|message|comment|email|document|page|html|webContent|searchResults|file(?:Content|_content)?)\b/;
const INTERPOLATION = /\$\{[^}]+\}|\{[a-z_][\w.]*\}|["'`]\s*\+\s*\w|\w\s*\+\s*["'`]|%s|\.format\(/;
const SECRET_IN_PROMPT = /process\.env\.\w*(?:KEY|SECRET|TOKEN|PASSWORD)|os\.environ\[?["']?\w*(?:KEY|SECRET|TOKEN|PASSWORD)|\b(?:password|api[_ ]key|secret|token)\s*(?:is|=|:)/i;

function promptInjection(file: DiffFile): Finding[] {
  const out: Finding[] = [];
  for (const { line, text } of file.added) {
    if (isComment(text) || !SYSTEM_SLOT.test(text)) continue;
    if (SECRET_IN_PROMPT.test(text)) {
      out.push(
        finding("prompt-injection", "high", file, line, text, "Secret placed in a system prompt", [
          "System prompts can be extracted by asking the model for them, so anything in one should be treated as public.",
          "Keep credentials in your code, where the model can't repeat them, and check permissions outside the model.",
        ], ["owasp-llm07", ...SECURITY]),
      );
    } else if (INTERPOLATION.test(text) && UNTRUSTED.test(text)) {
      out.push(
        finding("prompt-injection", "high", file, line, text, "Untrusted input written into the system prompt", [
          "Text from a request, document or web page is going into the model's instructions, so whoever writes that text can change what the model does.",
          "Keep the system prompt fixed. Put untrusted text in the user message, wrapped in clear delimiters, and tell the model to treat it as data. Limit what the model can do with tools, because no filter catches every injection.",
        ], ["owasp-llm01", "opc-genai"]),
      );
    }
  }
  return out;
}

// Model output is untrusted input. These sinks turn it into code, commands, queries or markup.
const DANGEROUS_SINK = /(?:\b(?:eval|new Function|exec(?:Sync)?|execFile(?:Sync)?|spawn(?:Sync)?|os\.system|os\.popen|subprocess\.\w+|document\.write|cursor\.execute|\.raw)|\$(?:query|execute)RawUnsafe)\s*\(|\.innerHTML\s*=|\bdangerouslySetInnerHTML\b|\bv-html\b|\{@html\b|\|\s*safe\b/;
const MODEL_OUTPUT = /\b(?:completion|choices\[\d\]|output_text|output\[\d\]|content\[\d\]\.text|llm\w*(?:Output|Response|Result|Text)|ai\w*(?:Output|Response|Result|Text|Answer|Reply)|model\w*(?:Output|Response)|generated\w*|assistantMessage|gptResponse|claudeResponse|result\.text|response\.text)\b/i;

function outputHandling(file: DiffFile): Finding[] {
  const out: Finding[] = [];
  for (const { line, text } of file.added) {
    if (isComment(text) || !DANGEROUS_SINK.test(text) || !MODEL_OUTPUT.test(text)) continue;
    out.push(
      finding("ai-output", "high", file, line, text, "Model output used as code, a command, a query or HTML", [
        "Whatever reaches the prompt can shape this output, including text an attacker planted in a page, file or message. Passing it here lets them run commands, change queries or inject script.",
        "Treat it as untrusted input: parse it into a fixed structure (structured output or a schema), check it against an allowlist, use parameterised queries, and escape it before rendering.",
      ], ["owasp-llm05", "owasp-llm01", ...SECURITY]),
    );
  }
  return out;
}

const AGENT_CONFIG = /(^|\/)(?:\.claude\/settings(?:\.local)?\.json|\.mcp\.json|\.cursor\/(?:mcp|settings)\.json|\.vscode\/(?:mcp|settings)\.json|\.codex\/config\.toml|\.gemini\/settings\.json|\.windsurf\/[^/]+\.json|mcp(?:_config)?\.json|claude_desktop_config\.json)$/;

interface AgencyCheck {
  pattern: RegExp;
  severity: Severity;
  title: string;
  body: string[];
  sections: string[];
  /** Only check files that configure an AI coding agent. */
  configOnly?: boolean;
  /** Only when the line is inside a permissions "allow" list. */
  allowListOnly?: boolean;
}

const AGENCY: AgencyCheck[] = [
  {
    pattern: /"defaultMode"\s*:\s*"bypassPermissions"|--dangerously-skip-permissions|--dangerously-bypass-approvals-and-sandbox|\bapproval_policy\s*=\s*"never"|\bsandbox_mode\s*=\s*"danger-full-access"|--yolo\b|"autoApprove"\s*:\s*true|"yolo"\s*:\s*true/,
    severity: "high",
    title: "AI agent runs without asking before it acts",
    body: [
      "This turns off the approval step, so the agent can run commands, change files and reach the network without anyone confirming. A prompt injection in a file, issue or web page it reads can then act with your permissions.",
      "Keep approvals on, and allow specific commands instead. If it must run unattended, run it in a disposable sandbox with no secrets and no production access.",
    ],
    sections: ["owasp-llm06", "owasp-llm01", "cccs-genai"],
  },
  {
    pattern: /"(?:Bash|Shell|run_terminal_cmd)(?:\(\*\)|\(\s*\*\s*\))?"|"Bash\((?:curl|wget|ssh|scp|rm|sudo|git push|npm publish|aws|gcloud|az|kubectl|docker)[^"]*\)"|"WebFetch"\s*[,\]]/,
    severity: "high",
    title: "AI agent allowed to run broad commands",
    body: [
      "This lets the agent run any shell command, or commands that send data out, delete things or publish, without asking.",
      "Allow narrow commands (`Bash(npm test)`, `Bash(git diff:*)`), and keep network, publishing and destructive commands behind approval.",
    ],
    sections: ["owasp-llm06", "cccs-genai"],
    configOnly: true,
    allowListOnly: true,
  },
  {
    pattern: /"trust"\s*:\s*true|"alwaysAllow"\s*:\s*\[/,
    severity: "medium",
    title: "MCP server tools run without confirmation",
    body: [
      "Every tool this server offers will run without asking first, including ones added in a later version.",
      "Confirm tool calls, or allow only the specific read-only tools the work needs.",
    ],
    sections: ["owasp-llm06", "owasp-llm03"],
    configOnly: true,
  },
  {
    // AI tools that act on the world, defined in application code.
    pattern: /\bname\s*[:=]\s*["'](?:run_?shell|shell|bash|terminal|exec\w*|run_?(?:command|code|script|sql|query)|execute_?\w+|eval\w*|delete_?\w+|drop_?\w+|write_?file|send_?(?:email|sms|message|payment|money)|transfer_?\w*|make_?payment|refund\w*|http_?request|fetch_?url|browse\w*)["']|["'](?:bash|computer|text_editor|code_execution)_20\d{6}["']/,
    severity: "medium",
    title: "AI tool that can take real actions",
    body: [
      "This gives the model a tool that runs code, changes data, sends messages or moves money. Anyone who can get text in front of the model, through a document, web page or message, may be able to make it call this tool.",
      "Give the tool the narrowest permissions it needs, validate its arguments in your code, and require a person to approve anything that can't be undone.",
    ],
    sections: ["owasp-llm06", "owasp-llm01"],
  },
];

const LAUNCHER = /"(?:npx|uvx|bunx|pnpx|dlx)"|"command"\s*:\s*"(?:npx|uvx|bunx)\b/;
const FIRST_PACKAGE = /"args"\s*:\s*\[\s*(?:"-[-\w]*"\s*,\s*)*"([^"-][^"]*)"/;

function agency(file: DiffFile): Finding[] {
  const out: Finding[] = [];
  const isConfig = AGENT_CONFIG.test(file.path);
  const seen = new Set<string>();
  const launchesPackages = isConfig && file.added.some((l) => LAUNCHER.test(l.text));
  // Permission lists span lines, so remember which list the current line is in.
  let list: "allow" | "deny" | "ask" | null = null;

  for (const { line, text } of file.added) {
    const opened = /"(allow|deny|ask)"\s*:/.exec(text);
    if (opened) list = opened[1] as "allow" | "deny" | "ask";
    if (isComment(text)) continue;

    for (const check of AGENCY) {
      if (check.configOnly && !isConfig) continue;
      if (check.allowListOnly && list !== "allow") continue;
      if (seen.has(check.title) || !check.pattern.test(text)) continue;
      seen.add(check.title);
      out.push(finding("ai-agency", check.severity, file, line, text, check.title, check.body, check.sections));
    }

    const pkg = launchesPackages ? FIRST_PACKAGE.exec(text)?.[1] : undefined;
    // "@scope/name@1.2.3" and "name==1.2.3" are pinned; "@latest" is not.
    if (pkg && !/@\d|==\d/.test(pkg.replace(/^@/, "")) && !seen.has("unpinned")) {
      seen.add("unpinned");
      out.push(
        finding("ai-agency", "medium", file, line, text, "MCP server installed from an unpinned package", [
          `This downloads and runs the latest \`${pkg}\` each time the agent starts. If the package is taken over or changes, the new code runs with the agent's access.`,
          "Pin an exact version (`package@1.2.3`), and check who publishes it before you add it.",
        ], ["owasp-llm03", "owasp-llm06"]),
      );
    }
    if (/\]/.test(text) && list) list = null;
  }
  return out;
}

// An AI agent in CI that anyone can trigger with an issue, comment or fork.
const AI_ACTION = /\buses:\s*(?:anthropics\/claude-code-action|anthropics\/claude-code-base-action|openai\/codex-action|google-github-actions\/run-gemini-cli|github\/copilot\w*)/;
const OPEN_TRIGGER = /\b(?:pull_request_target|issue_comment|issues|pull_request_review_comment|discussion_comment)\s*:/;

function ciAgents(file: DiffFile): Finding[] {
  if (!/^\.github\/workflows\/[^/]+\.ya?ml$/.test(file.path)) return [];
  const action = file.added.find((l) => AI_ACTION.test(l.text));
  if (!action) return [];
  const added = file.added.map((l) => l.text).join("\n");
  const trigger = OPEN_TRIGGER.test(added) || (file.status !== "added" && OPEN_TRIGGER.test(file.patch));
  if (!trigger) return [];
  return [
    finding("ai-agency", "high", file, action.line, action.text, "AI agent in CI that outside users can trigger", [
      "This workflow runs an AI agent on issues, comments or pull requests from forks. Anyone who can open an issue or comment can put instructions in front of it, and it runs with the workflow's token and secrets.",
      "Limit it to trusted authors (check `author_association` or a team membership), give the job read-only permissions, keep secrets out of it, and avoid `pull_request_target` with code from forks.",
    ], ["owasp-llm01", "owasp-llm06", "cccs-genai"]),
  ];
}

function retention(file: DiffFile): Finding[] {
  const out: Finding[] = [];
  for (const { line, text } of file.added) {
    if (isComment(text) || !/\bstore\s*[:=]\s*(?:true|True)\b/.test(text)) continue;
    out.push(
      finding("ai-retention", "medium", file, line, text, "AI provider asked to keep the conversation", [
        "With `store: true`, the provider keeps the prompt and response on its side, for example for evaluations and dashboards. Anything personal in them is kept there too.",
        "Leave it off unless you need it, and check how long the provider keeps stored data.",
      ], ["owasp-llm02", "opc-genai", "law25-s23", "pipeda-4.5.3"]),
    );
  }
  return out;
}

const NON_CANADIAN_REGION = /["'](?:us|eu|ap|sa|me|af|il|mx)-(?:east|west|central|north|south|northeast|southeast|northwest|southwest)-\d["']|["'](?:eastus2?|westus\d?|centralus|northeurope|westeurope|uksouth|swedencentral|francecentral|japaneast|australiaeast)["']|["'](?:us|europe|asia)-\w+\d["']|["'](?:us|eu|global)["']\s*[,)}]/;

function region(file: DiffFile): Finding[] {
  const added = file.added.map((l) => l.text).join("\n");
  if (!AI_CLIENT.test(added) && !AI_CALL.test(added)) return [];
  const out: Finding[] = [];
  for (const { line, text } of file.added) {
    if (isComment(text) || !/\b(?:region|location|aws_region|awsRegion|inference_geo|inferenceGeo)\b/i.test(text)) continue;
    if (!NON_CANADIAN_REGION.test(text)) continue;
    out.push(
      finding("ai-provider", "high", file, line, text, "AI processing outside Canada", [
        "Your policy requires AI processing in Canada, and this points the AI client at a region outside it.",
        "Use a Canadian region where your provider offers the model (for example AWS ca-central-1, Azure Canada Central or Canada East, or Google northamerica-northeast1), or get an exception approved.",
      ], ["law25-s17", "pipeda-4.1.3", "opc-genai"]),
    );
  }
  return out;
}

// Decisions about people that a model makes on its own.
const DECISION = /\b(?:approve|reject|deny|decline|eligib\w*|shortlist\w*|hire|hiring|candidate|r[ée]sum[ée]|applicant|credit ?(?:score|worth\w*)|loan|underwrit\w*|tenant|insurance claim|fraud score|risk score|terminate|disciplin\w*|admission)\b/i;

function automatedDecisions(file: DiffFile, config: Config): Finding[] {
  const added = file.added;
  for (let i = 0; i < added.length; i++) {
    const { line, text } = added[i]!;
    if (isComment(text) || !AI_CALL.test(text)) continue;
    // The prompt is usually within a few lines of the call.
    const window = added.slice(Math.max(0, i - 15), i + 15).map((l) => l.text).join("\n");
    if (!DECISION.test(window)) continue;
    const quebec = covers(config, "QC");
    return [
      finding("automated-decision", "medium", file, line, text, "AI may be making decisions about people", [
        "This prompt looks like it asks the model to decide something about a person, such as hiring, eligibility, credit or a claim.",
        ...(quebec
          ? ["If the decision is made without meaningful human review, Law 25 requires telling the person, and on request explaining the information and main factors used."]
          : []),
        "Have a person review the outcome before it takes effect, record the reasons, and tell people when AI is involved in decisions about them.",
      ], ["law25-s12.1", "pipeda-4.8", "opc-genai"]),
    ];
  }
  return [];
}
