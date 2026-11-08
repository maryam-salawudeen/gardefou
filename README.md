# Gardefou

*Garde-fou* is French for guardrail. Gardefou is a free pull request reviewer that checks code for two things: how it handles personal information under Canadian privacy law, and whether it uses AI safely. It runs as a GitHub Action, from the command line, or as a prompt in Claude, ChatGPT, Gemini, Copilot, Cursor and Codex.

It comments on the exact line with the problem, says what to do next, and cites the law or security guidance it relates to. When a change starts sending data to a new company, it drafts the privacy impact assessment for you.

> **Informational, not legal advice.** Gardefou reads code changes. It can't see your contracts, where a vendor actually processes data, or what your privacy policy says. Have the person in charge of personal information confirm anything that matters.

## Why I built it

Companies are adding Claude, ChatGPT and AI agents to their products and their daily work much faster than they're writing rules for them. I kept seeing the same problems in code: an API key in a website's JavaScript where any visitor can read it, customer records pasted into prompts, a chatbot whose instructions include whatever the customer typed, and AI agents allowed to run any command on a developer's laptop.

Canadian privacy law already covers a lot of this. When you send personal information to an AI provider, you're disclosing it to a third party, and you stay responsible for what that provider does with it. If the people are in Québec, Law 25 asks for a privacy impact assessment before their information leaves the province.

A written AI policy helps, but it can't stop a pull request. So I turned the rules into checks that run on every change, the way a security engineer would review it. There's also an [AI use policy template](docs/AI-POLICY.md) where each rule names the check that enforces it.

## Try it in 5 minutes

The easiest way to see what Gardefou does is a fire drill: give it a pull request with a few mistakes on purpose, watch it comment, then close the pull request. You do it all on the GitHub website, in any repository of yours.

**1. Make a test branch.** Open your repository on GitHub, click the branch button near the top left (it says **main**), type `gardefou-test` and click **Create branch: gardefou-test**.

**2. Add the workflow.** Click **Add file → Create new file**. Name it `.github/workflows/gardefou.yml` (GitHub turns each `/` into a folder). Paste this in:

```yaml
name: Privacy and AI review

on:
  pull_request:

permissions:
  contents: read
  pull-requests: write

jobs:
  review:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    env:
      MODEL: qwen2.5-coder:3b
    steps:
      - uses: actions/checkout@v4

      # Installs a free AI model on GitHub's computer for this review only.
      - name: Start Ollama
        run: |
          curl -fsSL https://ollama.com/install.sh | sh
          curl -sf http://localhost:11434/api/tags >/dev/null || (nohup ollama serve > /tmp/ollama.log 2>&1 &)
          for i in $(seq 1 60); do curl -sf http://localhost:11434/api/tags >/dev/null && break; sleep 1; done
          ollama pull "$MODEL"

      - uses: maryam-salawudeen/gardefou@v0
        id: review
        with:
          ai-provider: ollama
          model: ${{ env.MODEL }}

      - uses: actions/upload-artifact@v4
        if: steps.review.outputs.pia-dir != ''
        with:
          name: pia-drafts
          path: ${{ steps.review.outputs.pia-dir }}
```

Click **Commit changes...**, keep **Commit directly to the gardefou-test branch** selected, and click **Commit changes**.

**3. Add some mistakes.** Click **Add file → Create new file** again. Name it `demo/test.ts` and paste:

```ts
const openai = new OpenAI({ dangerouslyAllowBrowser: true });
console.log("signup", body.email, body.sin);
eval(answer.choices[0].message.content);
```

Commit it to the same branch.

**4. Open a pull request.** Go to the **Pull requests** tab, click **New pull request**, set the boxes to **main** ← **gardefou-test**, and click **Create pull request** twice.

**5. Wait about 3 minutes, then refresh.** In the **Files changed** tab you'll see a comment on each line in `demo/test.ts`: the API key sent to every visitor's browser, an email and SIN written to a log, and AI output run as code. In the **Conversation** tab there's one summary comment. Its last line says **Rules plus AI review (qwen2.5-coder:3b)** when the free AI review ran.

**6. Clean up.** Click **Close pull request**. Don't merge it.

To keep Gardefou on the repository, add the same workflow file to `main` and leave out `demo/test.ts`.

## What a comment looks like

On a line that adds `"defaultMode": "bypassPermissions"` to `.claude/settings.json`:

> **🔴 High · AI agent runs without asking before it acts**
>
> This turns off the approval step, so the agent can run commands, change files and reach the network without anyone confirming. A prompt injection in a file, issue or web page it reads can then act with your permissions.
>
> Keep approvals on, and allow specific commands instead. If it must run unattended, run it in a disposable sandbox with no secrets and no production access.
>
> <sub>OWASP Top 10 for LLMs LLM06 Excessive Agency · LLM01 Prompt Injection · Canadian Centre for Cyber Security ITSAP.00.041</sub>

## What it checks

### Using AI safely

| Rule | What it finds | Example |
|---|---|---|
| `ai-secret` | AI and cloud keys in code, keys in browser-exposed variables, AI clients running in the browser | `apiKey: "sk-ant-..."`, `NEXT_PUBLIC_OPENAI_API_KEY`, `dangerouslyAllowBrowser: true` |
| `prompt-injection` | Request data, documents or web content written into a system prompt, and secrets placed in one | ``system: `You help ${req.body.company}` `` |
| `ai-output` | AI output passed to a shell, eval, raw SQL or HTML | `execSync(completion.choices[0].message.content)` |
| `ai-agency` | AI tools that act without approval; Claude Code, Codex and Cursor settings that skip approvals or allow broad commands; unpinned or auto-approved MCP servers; AI agents in CI that outside users can trigger | `"defaultMode": "bypassPermissions"`, `"args": ["-y", "some-mcp-server"]`, `uses: anthropics/claude-code-action` on `issue_comment` |
| `ai-provider` | An AI provider your company hasn't approved, or one set to a region outside Canada when your policy requires Canada | `import OpenAI from "openai"` when only `anthropic` is approved; `region: "us-east-1"` |
| `ai-retention` | Asking the provider to keep conversations | `store: true` |
| `automated-decision` | Prompts that ask AI to decide about a person, such as hiring, eligibility, credit or claims | "decide whether to reject the candidate" |

### Personal information

| Rule | What it finds | Example |
|---|---|---|
| `new-recipient` | A new dependency, SDK import or call to a company's servers, looked up in a list of 113 vendors with their headquarters | `"@sentry/nextjs": "^9.0.0"`, `new OpenAI()`, `fetch("https://api.mixpanel.com/...")` |
| `personal-info-field` | New database columns, fields and form inputs that hold personal information, rated by how sensitive it is | `sin String?`, `dateOfBirth: Date`, `diagnosis TEXT` |
| `personal-info-leak` | Personal information sent to logs, analytics, error trackers, AI prompts or web addresses | `console.log(body.email)`, `posthog.capture("x", { email })` |
| `over-collection` | Settings that collect more than the feature needs | `sendDefaultPii: true`, `maskAllText: false`, `navigator.geolocation.watchPosition(...)` |

### Which laws it cites

| Where the people are | Laws |
|---|---|
| Anywhere in Canada | PIPEDA, the federal law for private businesses |
| Québec | Law 25, including s. 17 on information leaving Québec and s. 12.1 on automated decisions |
| Alberta | Alberta PIPA, including s. 13.1 on service providers outside Canada |
| British Columbia | BC PIPA |
| Any province or territory with a health information act, when `health: true` | That act, such as Ontario's PHIPA or Alberta's Health Information Act |

AI findings also cite the [Privacy Commissioner's generative AI principles](https://www.priv.gc.ca/en/privacy-topics/technology/artificial-intelligence/gd_principles_ai/), the [OWASP Top 10 for LLM Applications](https://genai.owasp.org/llm-top-10/) and the [Canadian Centre for Cyber Security](https://www.cyber.gc.ca/en/guidance/generative-artificial-intelligence-ai-itsap00041). Every summary is in [`src/law.ts`](src/law.ts) with a link to the official text. Health acts are cited by name only, because their section numbers differ by province.

## The free AI review

Gardefou's rules find most problems on their own. The AI review is an optional second look: it reads each finding in context, removes false alarms, rewrites the comment for your actual code, and adds what the rules missed.

| | Cost | Where your code goes |
|---|---|---|
| **Ollama** (the workflow above) | Free | Nowhere. A free, open AI model is installed on GitHub's computer for each review, or runs on your own computer |
| **Any OpenAI-compatible server** | Depends on the server | That server, for example LM Studio on your own machine |
| **Claude** | Paid, with your Anthropic API key | Anthropic |

[Ollama](https://ollama.com) is a free program that runs AI models on the computer itself instead of in someone else's cloud. On GitHub's computer it adds two or three minutes to each review. It's less thorough than Claude, so Gardefou is stricter with it: findings a small model adds on its own are capped at medium, so it can't block a merge by itself, and it can never dismiss a leaked key.

If you use a hosted provider's free tier instead, read its terms first. Some free tiers use what you send them to train their models, which is the kind of disclosure Gardefou is meant to catch.

## How it handles your code

It's a security tool, so it follows its own rules:

- **Rules only by default.** With no AI review, everything runs on GitHub's computer or yours. Nothing leaves except the comments posted to GitHub.
- **Secrets removed first.** Before any AI sees the change, keys are always removed, and emails, SINs, phone and card numbers are too unless you set `ai.redact: false`.
- **Secrets never quoted.** Comments show the line with the key replaced by `[REDACTED ...]`.
- **Code treated as data.** The AI review is told to ignore instructions hidden in the code, and it can only cite the sections in `src/law.ts` and comment on lines the pull request adds.

## Use it as a GitHub Action

The workflow in [Try it in 5 minutes](#try-it-in-5-minutes) is the full setup with the free AI review. Two other ways:

- **Rules only:** delete the "Start Ollama" step and the `with:` block under Gardefou.
- **Claude:** delete the "Start Ollama" step and replace the `with:` block with `anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}`.

| Input | Default | What it does |
|---|---|---|
| `ai-provider` | `auto` | `ollama` (free), `openai-compatible`, `anthropic`, `none`, or `auto` (Claude if a key is set, otherwise rules only) |
| `model` | `qwen2.5-coder:7b` for Ollama, `claude-opus-5-5` for Claude | Required for `openai-compatible` |
| `ai-url` | `http://localhost:11434` for Ollama | Required for `openai-compatible` |
| `ai-api-key` | none | For an `openai-compatible` server that needs a key |
| `anthropic-api-key` | none | For Claude |
| `fail-on` | from the config file | Fail the check at `high`, `medium` or `low` |
| `config-path` | `.gardefou.yml` | |
| `pia-dir` | `gardefou-pia` | Where PIA drafts are saved |

It runs on `pull_request`, never `pull_request_target`, so code from forks never runs with your secrets. On pull requests from forks, GitHub's token can't comment, so the review shows up in the job's summary page instead.

To block merges on serious problems, set `fail_on: high` in `.gardefou.yml` and make **Privacy and AI review / review** a required check under **Settings → Branches**.

## Use it from the command line

You need Node.js 20 or later. In any project folder:

```bash
npx github:maryam-salawudeen/gardefou --base main
```

It checks everything on your branch that isn't on `main` yet, using the rules only.

For the free AI review on your own computer, [install Ollama](https://ollama.com), download a model once, and add `--ai ollama`:

```bash
ollama pull qwen2.5-coder:7b
```

```bash
npx github:maryam-salawudeen/gardefou --base main --ai ollama
```

Nothing leaves your computer. Other options:

- `--model <name>` picks another model.
- `--ai openai-compatible --ai-url http://localhost:1234/v1 --model <name>` uses LM Studio or another OpenAI-compatible server. Set `AI_API_KEY` if it needs a key.
- `--ai anthropic` uses Claude with `ANTHROPIC_API_KEY`.
- `--pia-dir pia` saves the PIA drafts.
- `--format markdown` or `--format json` changes the output.
- `--fail-on high` makes it work as a pre-push check.
- `--diff changes.diff` reviews a saved diff, and `--diff -` reads one from stdin.

## Use it in your AI assistant

[`gardefou.md`](gardefou.md) is the whole review as one prompt: what to look for, how to report, the PIA outline, every legal summary and the vendor list. The files in [`skill/`](skill) are the same prompt packaged for each assistant, built from the same source as the Action, so your assistant cites the same law.

### Coding assistants

**Claude Code**, as a `/gardefou` skill in every project. It also uses it on its own when a change adds a vendor, an AI provider or agent settings:

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

To update any of these, run the same command again. For Codex, delete the old copy from `AGENTS.md` first.

### Chat assistants

| Assistant | Set it up as | What goes where |
|---|---|---|
| ChatGPT | A custom GPT | Paste [`skill/gpt-instructions.md`](skill/gpt-instructions.md) into Instructions and upload [`gardefou.md`](gardefou.md) under Knowledge. The full prompt is too long for the Instructions box. |
| Claude (web, desktop, mobile) | A skill | Zip the `skill/claude-code` folder and upload it in **Settings → Capabilities → Skills**. Or paste `gardefou.md` into a project's instructions. |
| Gemini | A Gem | Paste `gardefou.md` as the instructions. |
| Any other assistant | Custom instructions, or your first message | Paste or upload `gardefou.md`. |

Then paste a diff and ask for a privacy and AI security review.

## Configure it

Copy [`.gardefou.example.yml`](.gardefou.example.yml) to `.gardefou.yml` in your repository. The settings that matter most:

```yaml
jurisdictions:
  provinces: [ON, QC, BC]   # where the people whose information you handle live; default all
  health: false             # true for health custodians and the software they use

ai:
  approved_providers: [anthropic]   # any other AI provider is a high-severity finding
  require_canadian_region: true

vendors:
  approved:
    - id: stripe
      pia: docs/privacy/pia-stripe.md

fail_on: high
```

Changes to this file go through a pull request like any other code, so every exception to your AI policy is reviewed and recorded where everyone can see it.

## Limits

- **It reads the change, not the running app.** It can't see data that flows through code it doesn't recognise, or vendors a tag manager loads later. [Law 25 Transfer Mapper](https://github.com/maryam-salawudeen/law25-transfer-mapper) checks what a live website actually sends.
- **It works on patterns and names.** A column called `notes` that holds diagnoses, or a prompt built in another file, can slip past the rules. The AI review catches some of these.
- **It covers personal information and AI use.** It doesn't replace a secret scanner, a dependency scanner or a general code review.
- **Headquarters isn't where the data is processed.** Confirm that in each vendor's data processing agreement.
- **Public bodies aren't covered yet.** Governments, municipalities, school boards and hospitals fall under provincial public sector laws, which Gardefou doesn't include.

## Development

```bash
npm install
npm test
npm run review -- --diff test/fixtures/signup.diff
```

`npm run build` bundles the Action and the command into `dist/`, and `npm run skill` rebuilds the prompt files. Commit both: GitHub runs the Action straight from `dist/`, and CI fails if either is out of date.

To add a vendor, add it to `data/packages.json` and link a source for its headquarters in the pull request. To add a legal section, add it to `src/law.ts` with a summary that stays within what the section says.

If you try it, tell me what it caught, or what it missed, and I'll add a rule for it.

## Licence

MIT. Use it, change it, share it.
