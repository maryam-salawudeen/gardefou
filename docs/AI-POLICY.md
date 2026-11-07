# AI use policy template

A starting point for a company that wants its staff and its software to use AI tools such as Claude, ChatGPT, Gemini and Copilot without exposing personal information, secrets or systems. Each rule names the check in this tool that enforces it, so every pull request is tested against the policy.

Edit it to fit your company, then have your privacy officer and security lead approve it. Square brackets mark the choices you need to make.

> This template is informational, not legal advice.

## 1. Approved tools and providers

1.1 Staff may use only these AI tools for work: [list, for example Claude for Work, ChatGPT Enterprise, GitHub Copilot Business]. Personal or free accounts may not be used with company information.

1.2 Software we build may call only these AI providers: [list]. Each one has a signed agreement that says how long it keeps prompts and outputs, that it doesn't train on our data, and where it processes data.
*Enforced by `ai-provider`, with `ai.approved_providers` in `.gardefou.yml`.*

1.3 [If required] AI processing happens in Canada.
*Enforced by `ai-provider`, with `ai.require_canadian_region: true`.*

1.4 Before a new AI provider is added, we complete a privacy impact assessment. When Québec residents' information is involved, Law 25 s. 17 requires one before the information leaves Québec.
*The tool drafts it on the pull request that adds the provider.*

## 2. What may go into a prompt

2.1 Only the information the task needs. Identifiers such as names, emails, SINs and account numbers are removed or replaced with placeholders first, unless the task can't be done without them.
*Enforced by `personal-info-leak`.*

2.2 Never: passwords, API keys, tokens, private keys, or information classified [confidential or higher] in a tool that isn't approved for it.
*Enforced by `ai-secret` and `prompt-injection`.*

2.3 Providers are not asked to store conversations unless there's a documented reason.
*Enforced by `ai-retention`.*

## 3. Building with AI

3.1 API keys live on servers, in a secret manager. They are never committed and never sent to a browser or mobile app.
*Enforced by `ai-secret`.*

3.2 System prompts are fixed text. Requests, documents, web pages, emails and other untrusted text go in the user message, marked as data, and never in the instructions. System prompts never contain secrets.
*Enforced by `prompt-injection`.*

3.3 Model output is untrusted input. It is never run as code or a command, used in raw SQL, or rendered as HTML without being parsed into a fixed structure and checked.
*Enforced by `ai-output`.*

3.4 An AI feature that makes or recommends a decision about a person, such as hiring, eligibility, credit, a claim or discipline, has a person review the outcome before it takes effect. People are told when AI is involved and can ask how the decision was made. Law 25 s. 12.1 requires this notice in Québec when the decision is fully automated.
*Enforced by `automated-decision`.*

## 4. AI agents

4.1 An agent gets only the tools and permissions its task needs. Tools that run code, change or delete data, send messages or move money need a person's approval for each action that can't be undone.
*Enforced by `ai-agency`.*

4.2 AI coding agents (Claude Code, Codex, Cursor, Copilot, Gemini CLI) keep their approval prompts on. They are not run with `bypassPermissions`, `--dangerously-skip-permissions`, `approval_policy = "never"` or similar, except in a disposable sandbox with no secrets and no production access.
*Enforced by `ai-agency`.*

4.3 Allow lists name specific commands (`npm test`, `git diff`), not the whole shell, the network or publishing.
*Enforced by `ai-agency`.*

4.4 MCP servers come from publishers we've reviewed, are pinned to an exact version, and don't auto-approve their tools.
*Enforced by `ai-agency`.*

4.5 AI agents in CI run only for trusted authors, with read-only permissions and no secrets they don't need. They never run on `pull_request_target`, issue or comment triggers that outside users can fire.
*Enforced by `ai-agency`.*

## 5. Accountability

5.1 [Name or role] owns this policy and the list of approved tools and providers, and reviews them every [6 or 12] months.

5.2 A suspected leak of personal information through an AI tool is handled as a privacy incident: it is recorded, assessed for real risk of significant harm (PIPEDA s. 10.1, Alberta PIPA s. 34.1) or risk of serious injury (Law 25), and reported where required.

5.3 Exceptions are written down with a reason, an owner and an end date. In code, an exception is an entry in `.gardefou.yml` approved in a pull request by [the privacy officer or security lead].

## Sources

- Office of the Privacy Commissioner of Canada and provincial and territorial regulators, [Principles for responsible, trustworthy and privacy-protective generative AI technologies](https://www.priv.gc.ca/en/privacy-topics/technology/artificial-intelligence/gd_principles_ai/) (2023)
- Canadian Centre for Cyber Security, [Generative artificial intelligence (ITSAP.00.041)](https://www.cyber.gc.ca/en/guidance/generative-artificial-intelligence-ai-itsap00041)
- [OWASP Top 10 for LLM Applications](https://genai.owasp.org/llm-top-10/) (2025)
