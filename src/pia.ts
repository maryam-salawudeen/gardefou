import { covers, type Config } from "./config.js";
import { LAW_NAMES, SECTIONS, type SectionId } from "./law.js";
import type { Finding, Vendor } from "./types.js";
import { describeHq, isProfiling, outsideCanada, outsideQuebec } from "./vendors.js";

export interface PiaContext {
  repo?: string;
  pullRequest?: { number: number; url: string; title: string };
  date: string;
}

/**
 * A first draft of the assessment for one recipient: the Law 25 s. 17
 * assessment when Québec is in scope, otherwise a vendor privacy assessment of
 * the kind the OPC expects for PIPEDA accountability. Facts the
 * diff can show are filled in; everything else is a [bracketed] gap for the
 * privacy officer, because a draft that guesses is worse than one that asks.
 */
export function draftPia(vendor: Vendor, finding: Finding, ctx: PiaContext, config: Config): string {
  const where = describeHq(vendor.hq);
  const pr = ctx.pullRequest;
  const quebec = covers(config, "QC");
  const leaves = quebec ? outsideQuebec(vendor.hq) : outsideCanada(vendor.hq);
  const basis = quebec
    ? "Communication of personal information outside Québec (Law 25, s. 17)"
    : "Transfer of personal information to a service provider (PIPEDA Principle 4.1.3)";
  const cited: SectionId[] = quebec
    ? ["law25-s17", "law25-s18.3", "law25-s3.3", "pipeda-4.1.3"]
    : ["pipeda-4.1.3", "pipeda-4.8"];
  if (covers(config, "AB") && outsideCanada(vendor.hq) !== "no") cited.push("pipa-ab-s13.1");
  if (vendor.category === "ai") cited.push("opc-genai");

  const lines = [
    `# Privacy impact assessment draft: ${vendor.name}`,
    "",
    `${basis}. Draft generated ${ctx.date}` +
      (pr ? ` from [#${pr.number} ${pr.title}](${pr.url})` : "") +
      (ctx.repo ? ` in \`${ctx.repo}\`` : "") +
      ".",
    "",
    "> This is a starting point, not an assessment. Every [bracketed] item needs an answer from someone who knows the project and the contract.",
    "",
    "## The recipient",
    "",
    "| | |",
    "|---|---|",
    `| Service | ${vendor.name} |`,
    `| Operator | ${vendor.operator} |`,
    `| Headquarters | ${where}${vendor.hq ? "" : " [confirm]"} |`,
    `| Processing location | [from the data processing agreement] |`,
    `| Contracting entity for Canadian customers | [from the contract] |`,
    `| Privacy policy | ${vendor.privacyUrl ?? "[link]"} |`,
    `| Introduced in | \`${finding.path}\` line ${finding.line} |`,
    "",
    "## 1. Sensitivity of the information",
    "",
    "- What personal information will be sent: [list the fields, for example user id, email, IP address, page views]",
    "- Is any of it sensitive (medical, biometric, financial, about children, or otherwise intimate)? [yes / no, and which]",
    "- About how many people, and who they are: [customers, employees, visitors]",
    "",
    "## 2. Purposes",
    "",
    `- Why this vendor is used: [purpose]${vendor.category ? ` (category: ${vendor.category})` : ""}`,
    isProfiling(vendor)
      ? `- This is tracking technology${quebec ? ", so Law 25 s. 8.1 also applies" : ""}: how are people told, and how do they turn it on? [answer]`
      : "- Could the purpose be met with less information, or with de-identified information? [answer]",
    "",
    "## 3. Protection measures, including contractual ones",
    "",
    "- Written agreement in place: [yes / no, date, link]",
    "- The agreement limits use to the mandate, requires confidentiality, requires destruction at the end, and requires reporting incidents without delay: [check each]",
    "- Encryption in transit and at rest: [yes / no]",
    "- Retention period at the vendor: [period]",
    "- Can the vendor use the data for its own purposes, such as training models or building profiles? [yes / no]",
    ...(vendor.category === "ai"
      ? [
          "- Zero data retention, or the retention period for prompts and outputs: [answer]",
          "- What goes into prompts, and how identifiers are removed first: [answer]",
          "- Can model outputs about a person be corrected or deleted on request? [answer]",
        ]
      : []),
    "",
    "## 4. Legal framework where the information goes",
    "",
    leaves === "yes"
      ? `- Destination: ${where}. Describe the privacy protections there and any government access to data the vendor may be subject to. [answer]`
      : "- Destination: [confirm where the data is processed]",
    "- Generally accepted principles of personal information protection that apply there: [answer]",
    "",
    "## Conclusion",
    "",
    "- Would the information receive adequate protection? [yes / no, and why]",
    "- Decision: [go ahead / go ahead with conditions / don't go ahead]",
    "- Approved by the person in charge of the protection of personal information: [name, date]",
    "",
    "## Sections",
    "",
    ...cited.map((id) => `- **${LAW_NAMES[SECTIONS[id].law]} ${SECTIONS[id].label}**: ${SECTIONS[id].summary}`),
    "",
  ];
  return lines.join("\n");
}
