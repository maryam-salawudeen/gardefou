import { covers, type Config } from "../config.js";
import { HEALTH_SECTIONS } from "../law.js";
import type { DiffFile, Finding, Severity, Vendor } from "../types.js";
import { describeHq, isProfiling, outsideCanada, outsideQuebec, type VendorDb } from "../vendors.js";
import { isComment, truncate } from "./util.js";

interface Hit {
  vendor: Vendor;
  path: string;
  line: number;
  evidence: string;
  how: "dependency" | "import" | "endpoint";
}

const PY_MANIFEST = /(^|\/)(requirements[^/]*\.txt|pyproject\.toml|Pipfile|setup\.py|setup\.cfg)$/;

/**
 * Flags the first place a pull request starts sending data to a vendor: a new
 * dependency, an import of its SDK, or a call to one of its hosts. One finding
 * per vendor, so a vendor added in ten files gets one comment, not ten.
 */
export function newRecipients(files: DiffFile[], db: VendorDb, config: Config): Finding[] {
  // An approved AI provider counts as an approved vendor.
  const approved = new Set([...config.approvedVendors.map((v) => v.id), ...config.ai.approvedProviders]);
  const hits = new Map<string, Hit[]>();
  const add = (hit: Hit) => {
    if (approved.has(hit.vendor.id)) return;
    const list = hits.get(hit.vendor.id) ?? [];
    list.push(hit);
    hits.set(hit.vendor.id, list);
  };

  for (const file of files) {
    const isNpmManifest = /(^|\/)package\.json$/.test(file.path);
    const isPyManifest = PY_MANIFEST.test(file.path);

    for (const { line, text } of file.added) {
      if (isComment(text)) continue;

      if (isNpmManifest) {
        const dep = /^\s*"(@?[^"\s]+)"\s*:\s*"[^"]*"/.exec(text);
        const vendor = dep && db.byPackage("npm", dep[1]!);
        if (vendor) add({ vendor, path: file.path, line, evidence: truncate(text), how: "dependency" });
        continue;
      }
      if (isPyManifest) {
        const dep = /^\s*["']?([A-Za-z0-9][A-Za-z0-9_.-]*)(?:\[[^\]]*\])?\s*(?:[<>=~!;"',]|$)/.exec(text);
        const vendor = dep && db.byPackage("pypi", dep[1]!);
        if (vendor) add({ vendor, path: file.path, line, evidence: truncate(text), how: "dependency" });
        continue;
      }

      for (const spec of importedModules(text)) {
        const vendor = db.byPackage(spec.ecosystem, spec.name);
        if (vendor) add({ vendor, path: file.path, line, evidence: truncate(text), how: "import" });
      }
      for (const host of hostsIn(text)) {
        const vendor = db.byHost(host);
        if (vendor) add({ vendor, path: file.path, line, evidence: truncate(text), how: "endpoint" });
      }
    }
  }

  return [...hits.values()].map((list) => toFinding(list, config));
}

function toFinding(hits: Hit[], config: Config): Finding {
  // Point at code over manifests when both exist, because that is where data starts to flow.
  const first = hits.find((h) => h.how !== "dependency") ?? hits[0]!;
  const vendor = first.vendor;
  const quebec = covers(config, "QC");
  const leavesQuebec = outsideQuebec(vendor.hq);
  const leavesCanada = outsideCanada(vendor.hq);
  const profiling = isProfiling(vendor);
  const isAi = vendor.category === "ai";
  const unapprovedAi = isAi && config.ai.approvedProviders.length > 0;

  const sections = ["pipeda-4.1.3", "pipeda-4.8"];
  if (quebec) sections.unshift("law25-s17", "law25-s18.3");
  if (leavesCanada !== "no") sections.push("pipa-ab-s13.1");
  if (profiling) sections.push("law25-s8.1", "pipeda-4.3");
  if (isAi) sections.push("opc-genai", "cccs-genai", "owasp-llm02");
  if (config.health) sections.push(...HEALTH_SECTIONS);

  const paragraphs: string[] = [];
  paragraphs.push(
    `This change starts sending data to **${vendor.name}**, run by ${vendor.operator} (${describeHq(vendor.hq)}).` +
      (hits.length > 1 ? ` It shows up in ${hits.length} places in this pull request; this is the first.` : ""),
  );
  if (unapprovedAi) {
    paragraphs.push(
      `It isn't on your company's approved AI providers (${config.ai.approvedProviders.map((p) => `\`${p}\``).join(", ")}). Use an approved provider, or get this one reviewed and add it to \`ai.approved_providers\` in \`.gardefou.yml\`.`,
    );
  }

  if (leavesQuebec === "unknown") {
    paragraphs.push("Where this vendor is based isn't confirmed. Check its data processing agreement for the processing location.");
  }
  if (quebec && leavesQuebec === "yes") {
    paragraphs.push(
      "If any of it is personal information about people in Québec, Law 25 needs a privacy impact assessment and a written agreement **before** it goes live. Other provinces count as outside Québec.",
    );
  }
  paragraphs.push(
    `Everywhere in Canada you stay responsible for what ${vendor.operator} does with the data, so the contract has to give it comparable protection.` +
      (leavesCanada === "yes" ? " Your privacy policy should say that information may be processed outside Canada." : ""),
  );
  if (leavesCanada === "yes" && covers(config, "AB")) {
    paragraphs.push("For Albertans, the notice must also say who can answer questions about your service providers outside Canada.");
  }
  if (config.health) {
    paragraphs.push("If this handles personal health information for a custodian, your province's health information act also applies, including its rules on agents and service providers.");
  }
  if (profiling) {
    paragraphs.push("This is tracking technology. Tell people it's there and let them choose to turn it on before it starts.");
  }
  if (isAi) {
    paragraphs.push(
      "Before personal or confidential information goes into prompts, confirm in the contract how long the provider keeps it, whether it trains on it, and where it's processed. Ask for zero data retention if the account offers it.",
    );
  }
  if (vendor.note) paragraphs.push(vendor.note);
  if (!unapprovedAi) {
    paragraphs.push(
      `Already covered? Add \`- id: ${vendor.id}\` under \`vendors.approved\` in \`.gardefou.yml\` and this won't be raised again.`,
    );
  }

  return {
    rule: unapprovedAi ? "ai-provider" : "new-recipient",
    severity: unapprovedAi ? "high" : severityFor(vendor, quebec ? leavesQuebec : leavesCanada, profiling),
    path: first.path,
    line: first.line,
    title: unapprovedAi
      ? `Unapproved AI provider: ${vendor.name} (${describeHq(vendor.hq)})`
      : `New recipient: ${vendor.name} (${describeHq(vendor.hq)})`,
    body: paragraphs.join("\n\n"),
    sections,
    vendor,
    evidence: first.evidence,
  };
}

/** `leaves` is "outside Québec" when Québec is in scope, otherwise "outside Canada". */
function severityFor(vendor: Vendor, leaves: string, profiling: boolean): Severity {
  if (["cdn", "fonts", "captcha"].includes(vendor.category)) return "low";
  if (leaves === "no") return "low";
  if (profiling || vendor.category === "session-replay" || vendor.category === "ai") return "high";
  return "medium";
}

function importedModules(text: string): { ecosystem: "npm" | "pypi"; name: string }[] {
  const out: { ecosystem: "npm" | "pypi"; name: string }[] = [];
  for (const m of text.matchAll(/(?:from\s+|require\(\s*|import\(\s*|import\s+)["']([^"']+)["']/g)) {
    const spec = m[1]!;
    if (spec.startsWith(".") || spec.startsWith("/")) continue;
    const parts = spec.split("/");
    out.push({ ecosystem: "npm", name: spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]! });
  }
  const py = /^\s*(?:from\s+([A-Za-z_][\w.]*)\s+import\b|import\s+([A-Za-z_][\w.]*))/.exec(text);
  const mod = py?.[1] ?? py?.[2];
  if (mod && !/["']/.test(text)) out.push({ ecosystem: "pypi", name: mod.split(".")[0]! });
  return out;
}

function hostsIn(text: string): string[] {
  const hosts = new Set<string>();
  for (const m of text.matchAll(/(?:https?:)?\/\/([a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+)/gi)) {
    hosts.add(m[1]!.toLowerCase());
  }
  return [...hosts];
}
