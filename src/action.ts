import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as core from "@actions/core";
import * as github from "@actions/github";
import { loadConfig } from "./config.js";
import { fingerprint, inlineComment, MARKER, summaryComment } from "./format.js";
import { review, shouldFail } from "./review.js";
import type { Severity } from "./types.js";
import { loadVendors } from "./vendors.js";

type Octokit = ReturnType<typeof github.getOctokit>;

async function run() {
  const pr = github.context.payload.pull_request;
  if (!pr) {
    core.notice("Not a pull request event, so there's nothing to review.");
    return;
  }

  const config = loadConfig(core.getInput("config-path") || undefined);
  const failOn = core.getInput("fail-on");
  if (failOn) config.failOn = failOn as Severity | "none";

  const octokit = github.getOctokit(core.getInput("github-token", { required: true }));
  const { owner, repo } = github.context.repo;

  const { data: diff } = (await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: pr.number,
    mediaType: { format: "diff" },
  })) as unknown as { data: string };

  const apiKey = core.getInput("anthropic-api-key");
  if (apiKey) core.setSecret(apiKey);

  const result = await review(diff, {
    config,
    db: loadVendors(),
    ai: apiKey ? { apiKey, model: core.getInput("model") || undefined } : null,
    pia: {
      repo: `${owner}/${repo}`,
      pullRequest: { number: pr.number, url: pr.html_url ?? "", title: pr.title ?? "" },
      date: new Date().toISOString().slice(0, 10),
    },
    log: (msg) => core.warning(msg),
  });

  // Inline comments first, so the summary can say how many made it.
  let inlineCount = 0;
  try {
    inlineCount = await postInline(octokit, owner, repo, pr.number, pr.head.sha, result.findings, config);
  } catch (err) {
    core.warning(`Couldn't post inline comments (a pull request from a fork has a read-only token): ${message(err)}`);
  }

  const body = summaryComment(result, config, inlineCount);
  try {
    await upsertSummary(octokit, owner, repo, pr.number, body);
  } catch (err) {
    core.warning(`Couldn't post the summary comment: ${message(err)}`);
  }
  await core.summary.addRaw(body).write();

  const piaDir = core.getInput("pia-dir") || "gardefou-pia";
  if (result.piaDrafts.length) {
    mkdirSync(piaDir, { recursive: true });
    for (const d of result.piaDrafts) writeFileSync(join(piaDir, `pia-${d.vendor.id}.md`), d.markdown);
  }

  core.setOutput("findings", result.findings.length);
  core.setOutput("high", result.findings.filter((f) => f.severity === "high").length);
  core.setOutput("pia-dir", result.piaDrafts.length ? piaDir : "");

  if (shouldFail(result.findings, config)) {
    core.setFailed(`Privacy review found issues at "${config.failOn}" severity or above.`);
  }
}

async function postInline(
  octokit: Octokit,
  owner: string,
  repo: string,
  pull: number,
  sha: string,
  findings: Awaited<ReturnType<typeof review>>["findings"],
  config: ReturnType<typeof loadConfig>,
): Promise<number> {
  const existing = await octokit.paginate(octokit.rest.pulls.listReviewComments, { owner, repo, pull_number: pull, per_page: 100 });
  const posted = new Set(existing.flatMap((c) => [...c.body.matchAll(/gardefou:(\w+)/g)].map((m) => m[1])));

  const already = findings.filter((f) => posted.has(fingerprint(f))).length;
  const fresh = findings.filter((f) => !posted.has(fingerprint(f))).slice(0, Math.max(0, config.maxComments - already));
  if (!fresh.length) return already;

  await octokit.rest.pulls.createReview({
    owner,
    repo,
    pull_number: pull,
    commit_id: sha,
    event: "COMMENT",
    comments: fresh.map((f) => ({ path: f.path, line: f.line, side: "RIGHT" as const, body: inlineComment(f, config) })),
  });
  return already + fresh.length;
}

async function upsertSummary(octokit: Octokit, owner: string, repo: string, issue: number, body: string) {
  const comments = await octokit.paginate(octokit.rest.issues.listComments, { owner, repo, issue_number: issue, per_page: 100 });
  const mine = comments.find((c) => c.body?.startsWith(MARKER));
  if (mine) await octokit.rest.issues.updateComment({ owner, repo, comment_id: mine.id, body });
  else await octokit.rest.issues.createComment({ owner, repo, issue_number: issue, body });
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

run().catch((err) => core.setFailed(message(err)));
