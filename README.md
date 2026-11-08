# Gardefou

*Garde-fou* is French for guardrail. Gardefou checks code changes for two things before they go live: whether they use AI safely, and how they handle personal information under Canadian privacy law. It's free, and it runs on GitHub, on your own computer, or inside AI assistants like Claude, ChatGPT, Gemini, Copilot, Cursor and Codex.

Think of it as the security guard at the entrance of a building. Every change has to pass the front desk, and Gardefou looks at what's coming in: a master key left on the counter, someone carrying out a box of customer files, a new contractor handed keys to every room. When it spots one, it points at the exact line, says what to do, and names the law or security guidance it relates to. When a change starts sending data to a new company, it also drafts the privacy impact assessment (PIA), the risk assessment privacy law asks for before personal information goes to that company.

> **Informational, not legal advice.** Gardefou reads code changes. It can't see your contracts, where a company actually stores data, or what your privacy policy says. Have the person in charge of personal information confirm anything that matters.

## Why I built it

Companies are adding Claude, ChatGPT and AI agents (AI that can take actions by itself, not only chat) to their products and their daily work much faster than they're writing rules for them. I kept seeing the same problems in code:

- an API key, the password a program uses to reach an AI service, sitting in a website's code where any visitor can copy it
- customer records pasted into prompts sent to an AI company
- a chatbot whose instructions include whatever the customer typed, so a customer can rewrite its instructions
- AI agents allowed to run any command on a developer's laptop without asking

Canadian privacy law already covers a lot of this. When you send personal information to an AI company, you're sharing it with a third party, and you stay responsible for what that company does with it. If the people are in Québec, Law 25 asks for a privacy impact assessment before their information leaves the province.

A written AI policy helps, but a document can't stop a risky change. So I turned the rules into checks that run on every change, the way a security engineer would review it. There's also an [AI use policy template](docs/AI-POLICY.md) where each rule names the check that enforces it.

## A few words you'll see

- **Pull request:** on GitHub, a proposed change to a project. Others review it before it's merged into the main code.
- **GitHub Action and workflow:** GitHub can run tools automatically whenever something happens, such as a new pull request. A workflow file is the instruction list that tells GitHub what to run; an Action is a ready-made tool a workflow can use. Gardefou is an Action.
- **Diff:** the list of lines a change adds or removes. Gardefou only reads the diff, not the whole project.
- **Prompt and system prompt:** a prompt is what you send to an AI. The system prompt is the hidden instruction a company gives its AI, like "You are a polite support agent".
- **Prompt injection:** hiding instructions in text the AI reads (an email, a web page, a customer's message) so it does what an attacker wants. Like a stranger telling the front desk "the manager said to give me the master key".
- **MCP server:** a plug-in that gives an AI agent a new ability, such as reading your email or your GitHub.

## Try it in 5 minutes

The easiest way to see what Gardefou does is a fire drill: give it a pull request with a few mistakes on purpose, watch it comment, then close the pull request. You can do it all on the GitHub website, in any repository you own.

**1. Make a test branch.** A branch is a separate copy of your code where you can try things without touching the real version. Open your repository on GitHub, click the branch button near the top left (it says **main**), type `gardefou-test` and click **Create branch: gardefou-test**.

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

**3. Add some mistakes.** Click **Add file → Create new file** again. Name it `demo/test.ts` and paste these three lines:

```ts
const openai = new OpenAI({ dangerouslyAllowBrowser: true });
console.log("signup", body.email, body.sin);
eval(answer.choices[0].message.content);
```

They contain three deliberate mistakes: an AI key that would be sent to every visitor's browser, an email and SIN written into a log file, and an AI's answer run as computer code. Commit the file to the same branch.

**4. Open a pull request.** Go to the **Pull requests** tab, click **New pull request**, set the boxes to **main** ← **gardefou-test**, and click **Create pull request** twice.

**5. Wait about 3 minutes, then refresh.** In the **Files changed** tab you'll see a comment from Gardefou on each of the three lines. In the **Conversation** tab there's one summary comment. Its last line says **Rules plus AI review (qwen2.5-coder:3b)** when the free AI check ran.

**6. Clean up.** Click **Close pull request**. Don't merge it, so the deliberate mistakes never reach your real code.

To keep Gardefou on the repository, add the same workflow file to `main`, without `demo/test.ts`.

## What a comment looks like

On a line that turns off the approval step for Claude Code (an AI agent that writes and runs code):

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
| `ai-secret` | AI keys and other passwords written into code, or sent to the visitor's browser where anyone can copy them | `apiKey: "sk-ant-..."`, `NEXT_PUBLIC_OPENAI_API_KEY`, `dangerouslyAllowBrowser: true` |
| `prompt-injection` | A customer's message, a document or a web page written into an AI's hidden instructions, or a password placed in them | ``system: `You help ${req.body.company}` `` |
| `ai-output` | An AI's answer run as a command, as code, as a database query or shown as web page code, without checking it first | `execSync(completion.choices[0].message.content)` |
| `ai-agency` | AI agents with too much power: tools that act without approval, settings that switch approvals off, plug-ins installed without a fixed version, AI agents on GitHub that strangers can trigger | `"defaultMode": "bypassPermissions"`, `"args": ["-y", "some-mcp-server"]` |
| `ai-provider` | An AI company your company hasn't approved, or an AI service set up outside Canada when your policy requires Canada | `import OpenAI from "openai"` when only `anthropic` is approved; `region: "us-east-1"` |
| `ai-retention` | Asking the AI company to keep a copy of conversations | `store: true` |
| `automated-decision` | Asking an AI to decide something about a person, such as hiring, eligibility, credit or a claim | "decide whether to reject the candidate" |

### Personal information

| Rule | What it finds | Example |
|---|---|---|
| `new-recipient` | A change that starts sending data to a new company, by adding its code library (an SDK) or calling its servers. Gardefou knows where 113 common companies are headquartered | `"@sentry/nextjs": "^9.0.0"`, `new OpenAI()` |
| `personal-info-field` | New places to store personal information, such as database columns and form fields, rated by how sensitive it is | `sin String?`, `dateOfBirth: Date`, `diagnosis TEXT` |
| `personal-info-leak` | Personal information sent to log files, analytics tools, error trackers, AI prompts or web addresses | `console.log(body.email)`, `posthog.capture("x", { email })` |
| `over-collection` | Settings that collect more than the feature needs | `sendDefaultPii: true`, `maskAllText: false`, location tracking |

### Which laws it cites

| Where the people are | Laws |
|---|---|
| Anywhere in Canada | PIPEDA, the federal privacy law for private businesses |
| Québec | Law 25, including its rules on information leaving Québec (s. 17) and decisions made by computers alone (s. 12.1) |
| Alberta | Alberta PIPA, including its rule on service providers outside Canada (s. 13.1) |
| British Columbia | BC PIPA |
| Any province or territory with a health information law, when `health: true` | That law, such as Ontario's PHIPA or Alberta's Health Information Act |

AI findings also cite the [Privacy Commissioner's generative AI principles](https://www.priv.gc.ca/en/privacy-topics/technology/artificial-intelligence/gd_principles_ai/), the [OWASP Top 10 for LLM Applications](https://genai.owasp.org/llm-top-10/) (the standard list of the biggest security risks in AI applications) and the [Canadian Centre for Cyber Security](https://www.cyber.gc.ca/en/guidance/generative-artificial-intelligence-ai-itsap00041). Every summary is in [`src/law.ts`](src/law.ts) with a link to the official text. Health laws are cited by name only, because their section numbers differ by province.

## The free AI check

Gardefou's rules find most problems on their own. The AI check is an optional second look: an AI reads each finding in context, removes false alarms, rewrites the comment for your actual code, and adds what the rules missed.

| | Cost | Where your code goes |
|---|---|---|
| **Ollama** (the workflow above) | Free | Nowhere. A free AI model is set up on GitHub's computer for each review, or runs on your own computer |
| **Any OpenAI-compatible server** (software that accepts requests the same way OpenAI's service does) | Depends on the server | That server, for example LM Studio on your own computer |
| **Claude** | Paid, with your Anthropic API key | Anthropic |

[Ollama](https://ollama.com) is a free program that runs AI models on the computer itself instead of in someone else's cloud. It's like cooking at home instead of ordering from a restaurant: it costs nothing extra, and nobody outside sees what's in the pot. On GitHub's computer it adds two or three minutes to each review.

A small free model makes more mistakes than Claude, so Gardefou is stricter with it. Problems the small model finds on its own are marked medium at most, so it can't block a change by itself, and it can never dismiss a leaked key.

If you use a company's free AI plan instead, read its terms first. Some free plans use what you send them to train their models, which is the kind of data sharing Gardefou is meant to catch.

## How it handles your code

It's a security tool, so it follows its own rules:

- **Rules only by default.** With no AI check, everything runs on GitHub's computer or yours. Nothing leaves except the comments posted to GitHub.
- **Secrets removed first.** Before any AI sees the change, keys are always removed, and emails, SINs, phone and card numbers are too, unless you set `ai.redact: false`.
- **Secrets never quoted.** Comments show the line with the key replaced by `[REDACTED ...]`.
- **Code treated as text to review.** The AI check is told to ignore instructions hidden in the code, and it can only cite the sections in `src/law.ts` and comment on lines the pull request adds.

## Use it as a GitHub Action

The workflow in [Try it in 5 minutes](#try-it-in-5-minutes) is the full setup with the free AI check. Two other ways:

- **Rules only:** delete the "Start Ollama" step and the `with:` block under Gardefou.
- **Claude:** delete the "Start Ollama" step and replace the `with:` block with `anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}`. Save the key under **Settings → Secrets and variables → Actions** first.

| Setting | Default | What it does |
|---|---|---|
| `ai-provider` | `auto` | `ollama` (free), `openai-compatible`, `anthropic`, `none`, or `auto` (Claude if a key is set, otherwise rules only) |
| `model` | `qwen2.5-coder:7b` for Ollama, `claude-opus-5-5` for Claude | Required for `openai-compatible` |
| `ai-url` | `http://localhost:11434` for Ollama | Required for `openai-compatible` |
| `ai-api-key` | none | For an `openai-compatible` server that needs a key |
| `anthropic-api-key` | none | For Claude |
| `fail-on` | from the settings file | Mark the check as failed at `high`, `medium` or `low` |
| `config-path` | `.gardefou.yml` | |
| `pia-dir` | `gardefou-pia` | Where PIA drafts are saved |

It runs on `pull_request`, never `pull_request_target`, so changes from strangers' copies of your repository (forks) never run with your secrets. On those, GitHub doesn't let it comment, so the review shows up on the job's summary page instead.

**Blocking risky changes:** set `fail_on: high` in `.gardefou.yml`, then go to **Settings → Branches** and make **Privacy and AI review / review** a required check. GitHub then won't let a pull request be merged while it has a high-severity problem. Teams call this kind of automatic checking CI (continuous integration).

## Use it from the command line

You need [Node.js](https://nodejs.org) 20 or later, the free program that runs Gardefou. Open a terminal (the window where you type commands), go to any project folder, and run:

```bash
npx github:maryam-salawudeen/gardefou --base main
```

It checks everything on your branch that isn't on `main` yet, using the rules only.

For the free AI check on your own computer, [install Ollama](https://ollama.com), download a model once, and add `--ai ollama`:

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
- `--fail-on high` stops a `git push` when used as a pre-push hook (a check that runs before your code is uploaded).
- `--diff changes.diff` reviews a saved list of changes, and `--diff -` reads one typed or piped in.

## Use it in your AI assistant

[`gardefou.md`](gardefou.md) is the whole review written as one set of instructions for an AI: what to look for, how to report, the PIA outline, every legal summary and the company list. The files in [`skill/`](skill) are the same instructions packaged for each assistant, so your assistant cites the same law as the Action.

### Coding assistants

**Claude Code**, as a `/gardefou` skill in every project. It also uses it on its own when a change adds a company, an AI provider or AI agent settings:

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

**Cursor**, as a rule the AI pulls in when it's relevant. Run this in your project:

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
| ChatGPT | A custom GPT | Paste [`skill/gpt-instructions.md`](skill/gpt-instructions.md) into Instructions and upload [`gardefou.md`](gardefou.md) under Knowledge. The full version is too long for the Instructions box. |
| Claude (web, desktop, mobile) | A skill | Zip the `skill/claude-code` folder and upload it in **Settings → Capabilities → Skills**. Or paste `gardefou.md` into a project's instructions. |
| Gemini | A Gem | Paste `gardefou.md` as the instructions. |
| Any other assistant | Custom instructions, or your first message | Paste or upload `gardefou.md`. |

Then paste a list of changes and ask for a privacy and AI security review.

## Settings

Copy [`.gardefou.example.yml`](.gardefou.example.yml) to `.gardefou.yml` in your repository. The settings that matter most:

```yaml
jurisdictions:
  provinces: [ON, QC, BC]   # where the people whose information you handle live; default all
  health: false             # true for clinics, pharmacies and the software they use

ai:
  approved_providers: [anthropic]   # any other AI company is a high-severity finding
  require_canadian_region: true

vendors:
  approved:
    - id: stripe
      pia: docs/privacy/pia-stripe.md

fail_on: high
```

Changes to this file go through a pull request like any other code, so every exception to your AI policy is reviewed and recorded where everyone can see it.

## Limits

- **It reads the change, not the running app.** It can't see data that flows through code it doesn't recognise, or companies a website loads later. [Law 25 Transfer Mapper](https://github.com/maryam-salawudeen/law25-transfer-mapper) checks what a live website actually sends.
- **It works on patterns and names.** A column called `notes` that holds diagnoses, or a prompt built in another file, can slip past the rules. The AI check catches some of these.
- **It covers personal information and AI use.** It doesn't replace a secret scanner, a tool that checks your code libraries for known security holes, or a general code review.
- **A company's headquarters isn't always where it stores data.** Confirm that in each company's data processing agreement, the contract that says how it handles your data.
- **Public bodies aren't covered yet.** Governments, municipalities, school boards and hospitals follow provincial public sector laws, which Gardefou doesn't include.

## Development

```bash
npm install
npm test
npm run review -- --diff test/fixtures/signup.diff
```

`npm run build` prepares the files in `dist/`, and `npm run skill` rebuilds the AI assistant files. Commit both: GitHub runs the Action straight from `dist/`, and the tests fail if either is out of date.

To add a company, add it to `data/packages.json` and link a source for its headquarters in the pull request. To add a legal section, add it to `src/law.ts` with a summary that stays within what the section says.

If you try it, tell me what it caught, or what it missed, and I'll add a rule for it.

## Licence

MIT. Use it, change it, share it.
