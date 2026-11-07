# Gardefou

*Garde-fou* is French for guardrail. Gardefou sets AI and privacy guardrails for Canadian code.

It's a free, open source pull request reviewer that sets the boundary for how a Canadian company uses AI and handles personal information. It comments on the lines that leak an AI key, write untrusted text into a prompt, trust model output as code, give an agent more power than it needs, send personal information to a new vendor or an AI provider, or store sensitive data. Each comment cites Canadian privacy law (PIPEDA, Québec's Law 25, Alberta and BC PIPA, and the provincial health information acts) or the AI security guidance it relates to. When data starts going to a new vendor, it drafts the privacy impact assessment.

It runs three ways, from the same rules:

- **As a GitHub Action** that comments on every pull request.
- **As a command** you run on your branch before you push.
- **As a prompt** for Claude Code, Codex, Gemini CLI, Cursor, Copilot, ChatGPT, Gemini or Claude, so you can ask any assistant for the review.

Everything is MIT-licensed. There's no paid version.

> **Informational, not legal advice.** It reads code changes. It can't see your contracts, where a vendor actually processes data, or what your privacy policy says. Have the person in charge of personal information confirm anything that matters.

## Why

Companies are adopting Claude, ChatGPT, Copilot and AI agents faster than they're setting rules for them. The risks end up in code: an API key in a frontend bundle, customer records pasted into prompts, a support bot whose instructions include whatever the customer typed, an agent allowed to run any shell command, an MCP server that installs whatever version was published last night. Canadian privacy law already applies to all of it: personal information sent to an AI provider is a disclosure to a third party, and you stay accountable for what that provider does with it.

A written AI policy helps, but it doesn't stop a pull request. This tool turns the policy into checks that run on every change. [docs/AI-POLICY.md](docs/AI-POLICY.md) is a policy template where each rule names the check that enforces it.

## What it checks

### AI boundaries

| Rule | Finds | Example |
|---|---|---|
| `ai-secret` | AI and cloud keys in code, keys in browser-exposed variables, AI clients running in the browser | `apiKey: "sk-ant-..."`, `NEXT_PUBLIC_OPENAI_API_KEY`, `dangerouslyAllowBrowser: true` |
| `prompt-injection` | Request data, documents or web content written into a system prompt, and secrets placed in one | ``system: `You help ${req.body.company}` `` |
| `ai-output` | Model output passed to a shell, eval, raw SQL or HTML | `execSync(completion.choices[0].message.content)` |
| `ai-agency` | Agent tools that act without approval; Claude Code, Codex and Cursor settings that skip approvals or allow broad commands; unpinned or auto-approved MCP servers; AI agents in CI that outside users can trigger | `"defaultMode": "bypassPermissions"`, `"args": ["-y", "some-mcp-server"]`, `uses: anthropics/claude-code-action` on `issue_comment` |
| `ai-provider` | An AI provider your company hasn't approved, or one configured outside Canada when your policy requires Canada | `import OpenAI from "openai"` when only `anthropic` is approved; `region: "us-east-1"` |
| `ai-retention` | Asking the provider to keep conversations | `store: true` |
| `automated-decision` | Prompts that ask a model to decide about a person, such as hiring, eligibility, credit or claims | "decide whether to reject the candidate" |

### Personal information

| Rule | Finds | Example |
|---|---|---|
| `new-recipient` | A new dependency, SDK import or call to a vendor's host, looked up in a list of 113 vendors with their headquarters | `"@sentry/nextjs": "^9.0.0"`, `new OpenAI()`, `fetch("https://api.mixpanel.com/...")` |
| `personal-info-field` | New columns, fields, types and form inputs that hold personal information, rated by sensitivity | `sin String?`, `dateOfBirth: Date`, `diagnosis TEXT` |
| `personal-info-leak` | Personal information or whole records sent to logs, analytics, error trackers, AI prompts or URL query strings | `console.log(body.email)`, `posthog.capture("x", { email })`, a prompt containing `${user.firstName}` |
| `over-collection` | Settings that collect more than the feature needs | `sendDefaultPii: true`, `maskAllText: false`, `navigator.geolocation.watchPosition(...)` |

### Which laws it cites

| Where the people are | Laws cited |
|---|---|
| Anywhere in Canada | PIPEDA, the federal law for private sector organizations |
| Québec | Law 25 (the private sector Act, P-39.1), including s. 17 on information leaving Québec and s. 12.1 on automated decisions |
| Alberta | Alberta PIPA, including s. 13.1 on service providers outside Canada |
| British Columbia | BC PIPA |
| Any province or territory with a health information act, when `health: true` | That act: Ontario PHIPA, Alberta HIA, Saskatchewan HIPA, Manitoba PHIA, and the acts in New Brunswick, Nova Scotia, Newfoundland and Labrador, PEI, Yukon, the Northwest Territories and Québec |

AI findings also cite the [OPC's generative AI principles](https://www.priv.gc.ca/en/privacy-topics/technology/artificial-intelligence/gd_principles_ai/), the [OWASP Top 10 for LLM Applications](https://genai.owasp.org/llm-top-10/) and the [Canadian Centre for Cyber Security](https://www.cyber.gc.ca/en/guidance/generative-artificial-intelligence-ai-itsap00041). Every summary is in [`src/law.ts`](src/law.ts) next to a link to the official text. The health acts are cited by name only, without section numbers.

## How it treats your code

It's a security tool, so it holds itself to the same rules:

- By default it runs entirely on rules, on the GitHub runner or your machine. Nothing leaves except the comments it posts to GitHub.
- When you turn on the AI review, a model checks each finding in context, drops the ones that don't hold up, and adds what the rules missed. Before the diff is sent, secrets are always removed, and emails, SINs, phone and card numbers are too unless you set `ai.redact: false`. The summary says how many values were removed.
- A model can't dismiss a leaked key. Secret findings stay even if the model says otherwise.
- Comments never quote a secret. The line is shown with the key replaced by `[REDACTED ...]`.
- The AI review is told to treat the diff as data and ignore instructions inside it, and it can only cite the sections in `src/law.ts` and comment on lines the pull request adds.

## The AI review, free or paid

The rules find most problems on their own. The AI review is an optional second pass that reads each finding in context, removes false alarms, rewrites the comment for the actual code, and adds what the rules missed. You can run it three ways:

| | Cost | Where the diff goes | Best for |
|---|---|---|---|
| **GitHub Models** | Free, within GitHub's daily limits (around 50 to 150 requests a day, depending on the model) | GitHub's model service | Pull requests in GitHub Actions |
| **Ollama** | Free | Nowhere. The model runs on your machine | The command line, and code you can't send anywhere |
| **Claude** | Paid, with your Anthropic API key | Anthropic | Large pull requests and the most thorough review |

GitHub Models' free tier only takes a few thousand tokens per request, so Gardefou sends it a trimmed prompt: the files with findings first, and only the sections those findings cite. On a large pull request, part of the diff is left out and the summary says so. If the daily limit runs out, the rules still run and the summary says the AI review will be back the next day.

## What a comment looks like

On the line that adds `"defaultMode": "bypassPermissions"` to `.claude/settings.json`:

> **🔴 High · AI agent runs without asking before it acts**
>
> This turns off the approval step, so the agent can run commands, change files and reach the network without anyone confirming. A prompt injection in a file, issue or web page it reads can then act with your permissions.
>
> Keep approvals on, and allow specific commands instead. If it must run unattended, run it in a disposable sandbox with no secrets and no production access.
>
> <sub>OWASP Top 10 for LLMs LLM06 Excessive Agency · LLM01 Prompt Injection · Canadian Centre for Cyber Security ITSAP.00.041</sub>

The pull request also gets one summary comment, kept up to date on each push, with every finding and a PIA draft for each new vendor.

## Use it as a GitHub Action

Add `.github/workflows/gardefou.yml`:

```yaml
name: Privacy and AI review

on:
  pull_request:

permissions:
  contents: read
  pull-requests: write
  models: read # for the free AI review; remove it if you don't use github-models

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: maryam-salawudeen/gardefou@v0
        id: review
        with:
          ai-provider: github-models # free; or leave this out for rules only
      - uses: actions/upload-artifact@v4
        if: steps.review.outputs.pia-dir != ''
        with:
          name: pia-drafts
          path: ${{ steps.review.outputs.pia-dir }}
```

It runs on `pull_request`, not `pull_request_target`, so code from forks never runs with your secrets. On pull requests from forks, the token is read-only and the review appears in the job summary instead of as comments.

| Input | Default | |
|---|---|---|
| `ai-provider` | `auto` | `github-models` (free), `anthropic`, `none`, or `auto` (Claude if a key is set, otherwise rules only) |
| `anthropic-api-key` | none | For `ai-provider: anthropic` |
| `model` | `openai/gpt-4.1` for GitHub Models, `claude-opus-5-5` for Claude | |
| `fail-on` | from the config file | Fail the check at `high`, `medium` or `low` |
| `config-path` | `.gardefou.yml` | |
| `pia-dir` | `gardefou-pia` | Where PIA drafts are written |

## Use it from the command line

Needs Node 20 or later.

```bash
npx gardefou --base main
```

It compares your working tree with where your branch left `main`.

For the free AI review on your own machine, [install Ollama](https://ollama.com), pull a model, and pass `--ai ollama`:

```bash
ollama pull qwen2.5-coder:7b
npx gardefou --base main --ai ollama
```

Nothing leaves your computer. `--model` picks another model, and `--ai-url` points at another OpenAI-compatible server, such as LM Studio (`--ai-url http://localhost:1234/v1`). `--ai github-models` uses GitHub Models with a `GITHUB_TOKEN` that has the models scope, and `--ai anthropic` uses Claude with `ANTHROPIC_API_KEY`.

Other options: `--pia-dir pia` writes the PIA drafts, `--format markdown` and `--format json` change the output, and `--fail-on high` makes it usable as a pre-push hook. `--diff changes.diff` reviews a saved diff and `--diff -` reads one from stdin.

## Use it in any AI assistant

[`gardefou.md`](gardefou.md) is the whole review as one prompt: what to look for, how to report, the PIA outline, every section summary and the vendor table. The files in [`skill/`](skill) are the same prompt packaged for each assistant, built from the same source as the Action, so the assistant cites the same law and the same headquarters.

### Coding assistants

**Claude Code**, installed globally as a `/gardefou` skill it also uses on its own when a change adds a vendor, an AI provider or agent settings:

```bash
mkdir -p ~/.claude/skills/gardefou && curl -sL https://raw.githubusercontent.com/maryam-salawudeen/gardefou/main/skill/claude-code/SKILL.md -o ~/.claude/skills/gardefou/SKILL.md
```

**OpenAI Codex CLI** (adds it to your global instructions; anything already in the file stays):

```bash
mkdir -p ~/.codex && curl -sL https://raw.githubusercontent.com/maryam-salawudeen/gardefou/main/gardefou.md >> ~/.codex/AGENTS.md
```

**Gemini CLI**, as a `/gardefou` command:

```bash
mkdir -p ~/.gemini/commands && curl -sL https://raw.githubusercontent.com/maryam-salawudeen/gardefou/main/skill/gardefou.toml -o ~/.gemini/commands/gardefou.toml
```

**Cursor**, as a rule the agent pulls in when it's relevant. Run this in your project:

```bash
mkdir -p .cursor/rules && curl -sL https://raw.githubusercontent.com/maryam-salawudeen/gardefou/main/skill/gardefou.mdc -o .cursor/rules/gardefou.mdc
```

**GitHub Copilot in VS Code**, as a `/gardefou` prompt in Copilot Chat. Run this in your project:

```bash
mkdir -p .github/prompts && curl -sL https://raw.githubusercontent.com/maryam-salawudeen/gardefou/main/skill/gardefou.prompt.md -o .github/prompts/gardefou.prompt.md
```

To update any of these, run the same command again (for Codex, delete the old copy from `AGENTS.md` first).

### Chat assistants

| Assistant | Set it up as | What goes where |
|---|---|---|
| ChatGPT | A custom GPT | Paste [`skill/gpt-instructions.md`](skill/gpt-instructions.md) into Instructions and upload [`gardefou.md`](gardefou.md) under Knowledge. The full prompt is longer than the 8,000-character Instructions box. |
| Claude (web, desktop, mobile) | A skill | Zip the `skill/claude-code` folder and upload it in Settings → Capabilities → Skills. Or paste `gardefou.md` into a project's instructions. |
| Gemini | A Gem | Paste `gardefou.md` as the instructions. |
| Any other assistant | Its custom instructions, or your first message | Paste or upload `gardefou.md`. |

Then paste a diff and ask for a privacy and AI security review.

## Configure it

Copy [`.gardefou.example.yml`](.gardefou.example.yml) to `.gardefou.yml`. The settings that matter most:

```yaml
jurisdictions:
  provinces: [ON, QC, BC]   # where the people whose information you handle live; default all
  health: false             # true for health custodians and the software they use

ai:
  approved_providers: [anthropic]   # anything else is a high-severity finding
  require_canadian_region: true

vendors:
  approved:
    - id: stripe
      pia: docs/privacy/pia-stripe.md

fail_on: high
```

Changes to this file go through a pull request like any other code, so an exception to the AI policy is reviewed and recorded where everyone can see it.

## Limits

- It reads the diff, not the running app. It can't see data that flows through code it doesn't recognise, or vendors loaded by a tag manager at runtime. [Law 25 Transfer Mapper](https://github.com/maryam-salawudeen/law25-transfer-mapper) covers what a live website actually sends.
- Detection works on patterns and names. A column called `notes` that holds diagnoses, or a prompt built in another file, can be missed by the rules; the AI review catches some of these.
- It doesn't replace a secret scanner, dependency scanner or general code review. It covers personal information and AI use.
- Headquarters isn't the processing location. Confirm where each vendor processes data in its data processing agreement.
- Public bodies (governments, municipalities, school boards, hospitals) are covered by provincial public sector laws, which aren't included yet.

## Development

```bash
npm install
npm test
npm run review -- --diff test/fixtures/signup.diff
```

`npm run build` bundles the Action and the command into `dist/`, and `npm run skill` rebuilds the prompt files. Commit both: GitHub runs the Action straight from `dist/`, and CI fails if either is out of date.

To add a vendor, add it to `data/packages.json` with a source for its headquarters in the pull request. To add a section, add it to `src/law.ts` with a summary that stays within what the section says.

## Licence

MIT
