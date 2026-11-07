// Sections and guidance cited in review comments. Summaries are paraphrased so
// they fit in a comment; the official text is the only authority. Keep each
// summary to what the source says, and add a new id rather than stretching one.
//
// Health information acts are cited by name, without section numbers, because
// their numbering differs by province and a wrong section is worse than none.

import type { Law, Province } from "./types.js";

export type Guidance = "opc" | "owasp" | "cccs";
export type Source = Law | Guidance;

export interface Section {
  law: Source;
  label: string;
  summary: string;
  url: string;
}

const LAW25_URL = "https://www.legisquebec.gouv.qc.ca/en/document/cs/P-39.1";
const PIPEDA_URL = "https://laws-lois.justice.gc.ca/eng/acts/P-8.6/";
const PIPA_AB_URL = "https://kings-printer.alberta.ca/documents/Acts/P06P5.pdf";
const PIPA_BC_URL = "https://www.bclaws.gov.bc.ca/civix/document/id/complete/statreg/03063_01";
const OPC_GENAI_URL = "https://www.priv.gc.ca/en/privacy-topics/technology/artificial-intelligence/gd_principles_ai/";
const OWASP_URL = "https://genai.owasp.org/llm-top-10/";
const CCCS_GENAI_URL = "https://www.cyber.gc.ca/en/guidance/generative-artificial-intelligence-ai-itsap00041";

export const LAW_NAMES: Record<Source, string> = {
  law25: "Québec Law 25 (P-39.1)",
  pipeda: "PIPEDA",
  "pipa-ab": "Alberta PIPA",
  "pipa-bc": "BC PIPA",
  "health-qc": "Québec health and social services information Act",
  "health-on": "Ontario PHIPA",
  "health-ab": "Alberta Health Information Act",
  "health-sk": "Saskatchewan HIPA",
  "health-mb": "Manitoba PHIA",
  "health-nb": "New Brunswick PHIPAA",
  "health-ns": "Nova Scotia PHIA",
  "health-nl": "Newfoundland and Labrador PHIA",
  "health-pe": "PEI Health Information Act",
  "health-yt": "Yukon HIPMA",
  "health-nt": "NWT Health Information Act",
  opc: "OPC generative AI principles",
  owasp: "OWASP Top 10 for LLMs",
  cccs: "Canadian Centre for Cyber Security",
};

const HEALTH_SUMMARY =
  "Applies to health information custodians, such as clinics, pharmacies and practitioners, and to the agents and service providers they use. Custodians must protect personal health information, collect and use only what they need, and stay responsible for what their service providers do with it.";

function healthAct(law: Law, label: string, url: string): Section {
  return { law, label, summary: HEALTH_SUMMARY, url };
}

export const SECTIONS = {
  // Québec, Act respecting the protection of personal information in the private sector, as amended by Law 25.
  "law25-s3.3": {
    law: "law25",
    label: "s. 3.3",
    summary:
      "A privacy impact assessment is required for any project to acquire, develop or overhaul an information system or electronic service delivery system involving personal information.",
    url: LAW25_URL,
  },
  "law25-s4": {
    law: "law25",
    label: "ss. 4–5",
    summary:
      "Personal information may be collected only for a serious and legitimate reason, and only the information necessary for the purposes determined before collection.",
    url: LAW25_URL,
  },
  "law25-s8.1": {
    law: "law25",
    label: "s. 8.1",
    summary:
      "Before using technology that can identify, locate or profile a person, inform them that it is used and of the means to activate those functions.",
    url: LAW25_URL,
  },
  "law25-s10": {
    law: "law25",
    label: "s. 10",
    summary:
      "Take security measures that are reasonable given the sensitivity, purposes, quantity, distribution and medium of the information.",
    url: LAW25_URL,
  },
  "law25-s12": {
    law: "law25",
    label: "s. 12",
    summary:
      "Information is sensitive when its medical, biometric or otherwise intimate nature, or the context of its use, gives a high expectation of privacy. Consent to use sensitive information for a new purpose must be given expressly.",
    url: LAW25_URL,
  },
  "law25-s12.1": {
    law: "law25",
    label: "s. 12.1",
    summary:
      "When personal information is used to make a decision based exclusively on automated processing, the person must be told no later than when they are told the decision. On request, they must be told what information was used, the main reasons and factors behind the decision, and that they can have the information corrected.",
    url: LAW25_URL,
  },
  "law25-s17": {
    law: "law25",
    label: "s. 17",
    summary:
      "Before communicating personal information outside Québec, conduct a privacy impact assessment covering its sensitivity, the purposes, the protection measures (including contractual ones) and the legal framework where it is going. The communication must be the subject of a written agreement. \"Outside Québec\" includes other provinces.",
    url: LAW25_URL,
  },
  "law25-s18.3": {
    law: "law25",
    label: "s. 18.3",
    summary:
      "A service provider may receive personal information without consent when it is needed for a mandate, but the mandate must be in writing and say how the provider protects the information, uses it only for the mandate and stops keeping it when the mandate ends.",
    url: LAW25_URL,
  },
  "law25-s23": {
    law: "law25",
    label: "s. 23",
    summary: "When the purposes for which personal information was collected are achieved, destroy it or anonymize it.",
    url: LAW25_URL,
  },

  // PIPEDA, Schedule 1 principles. Applies to commercial activity in every
  // province and territory, except where a substantially similar provincial law applies.
  "pipeda-4.1.3": {
    law: "pipeda",
    label: "Principle 4.1.3",
    summary:
      "An organization stays responsible for personal information it transfers to a third party for processing, and must use contracts or other means to give it a comparable level of protection.",
    url: PIPEDA_URL,
  },
  "pipeda-4.3": {
    law: "pipeda",
    label: "Principle 4.3",
    summary:
      "Knowledge and consent are required for collection, use and disclosure. The form of consent depends on the sensitivity of the information.",
    url: PIPEDA_URL,
  },
  "pipeda-4.4": {
    law: "pipeda",
    label: "Principle 4.4",
    summary: "Collection is limited to what is necessary for the purposes the organization has identified.",
    url: PIPEDA_URL,
  },
  "pipeda-4.5.3": {
    law: "pipeda",
    label: "Principle 4.5.3",
    summary: "Personal information that is no longer needed should be destroyed, erased or made anonymous.",
    url: PIPEDA_URL,
  },
  "pipeda-4.7": {
    law: "pipeda",
    label: "Principle 4.7",
    summary: "Personal information must be protected by security safeguards appropriate to its sensitivity.",
    url: PIPEDA_URL,
  },
  "pipeda-4.8": {
    law: "pipeda",
    label: "Principle 4.8",
    summary: "An organization must make specific information about its policies and practices for managing personal information readily available.",
    url: PIPEDA_URL,
  },

  // Alberta, Personal Information Protection Act.
  "pipa-ab-s11": {
    law: "pipa-ab",
    label: "s. 11",
    summary: "Collect personal information only for purposes that are reasonable, and only to the extent reasonable for those purposes.",
    url: PIPA_AB_URL,
  },
  "pipa-ab-s13.1": {
    law: "pipa-ab",
    label: "s. 13.1",
    summary:
      "An organization that uses a service provider outside Canada must tell people how to get its policies on that, and who can answer their questions about it.",
    url: PIPA_AB_URL,
  },
  "pipa-ab-s34": {
    law: "pipa-ab",
    label: "s. 34",
    summary: "Make reasonable security arrangements against risks such as unauthorized access, use, disclosure or destruction.",
    url: PIPA_AB_URL,
  },

  // British Columbia, Personal Information Protection Act.
  "pipa-bc-s11": {
    law: "pipa-bc",
    label: "s. 11",
    summary: "Collect personal information only for purposes that a reasonable person would consider appropriate in the circumstances.",
    url: PIPA_BC_URL,
  },
  "pipa-bc-s34": {
    law: "pipa-bc",
    label: "s. 34",
    summary: "Protect personal information in your custody or control by making reasonable security arrangements against unauthorized access, collection, use, disclosure, copying, modification or disposal.",
    url: PIPA_BC_URL,
  },

  // Provincial and territorial health information acts. Only cited when
  // `health: true`, for custodians and the vendors that work for them.
  "health-qc": healthAct("health-qc", "(2023, c. 5)", "https://www.legisquebec.gouv.qc.ca/en/document/cs/R-22.1"),
  "health-on": healthAct("health-on", "(2004)", "https://www.ontario.ca/laws/statute/04p03"),
  "health-ab": healthAct("health-ab", "(RSA 2000, c. H-5)", "https://kings-printer.alberta.ca/documents/Acts/H05.pdf"),
  "health-sk": healthAct("health-sk", "(SS 1999, c. H-0.021)", "https://www.canlii.org/en/sk/laws/stat/ss-1999-c-h-0.021/latest/"),
  "health-mb": healthAct("health-mb", "(CCSM c. P33.5)", "https://web2.gov.mb.ca/laws/statutes/ccsm/p033-5e.php"),
  "health-nb": healthAct("health-nb", "(SNB 2009, c. P-7.05)", "https://www.canlii.org/en/nb/laws/stat/snb-2009-c-p-7.05/latest/"),
  "health-ns": healthAct("health-ns", "(SNS 2010, c. 41)", "https://www.canlii.org/en/ns/laws/stat/sns-2010-c-41/latest/"),
  "health-nl": healthAct("health-nl", "(SNL 2008, c. P-7.01)", "https://www.canlii.org/en/nl/laws/stat/snl-2008-c-p-7.01/latest/"),
  "health-pe": healthAct("health-pe", "(RSPEI 1988, c. H-1.41)", "https://www.canlii.org/en/pe/laws/stat/rspei-1988-c-h-1.41/latest/"),
  "health-yt": healthAct("health-yt", "(SY 2013, c. 16)", "https://www.canlii.org/en/yk/laws/stat/sy-2013-c-16/latest/"),
  "health-nt": healthAct("health-nt", "(SNWT 2014, c. 2)", "https://www.canlii.org/en/nt/laws/stat/snwt-2014-c-2/latest/"),

  // Guidance. Not law, so it's cited for every jurisdiction, but it is what
  // Canada's privacy regulators and security agencies expect.
  "opc-genai": {
    law: "opc",
    label: "(2023)",
    summary:
      "Canada's federal, provincial and territorial privacy regulators expect organizations using generative AI to have legal authority for the personal information they put into it, use only what's necessary, be open about its use, stay accountable for its outputs, and guard against prompt injection, model inversion and jailbreaking.",
    url: OPC_GENAI_URL,
  },
  "owasp-llm01": {
    law: "owasp",
    label: "LLM01 Prompt Injection",
    summary: "Text from users, web pages, files or emails can change what a model does when it reaches the prompt. Instructions in data can't be fully filtered out, so limit what the model is allowed to do.",
    url: OWASP_URL,
  },
  "owasp-llm02": {
    law: "owasp",
    label: "LLM02 Sensitive Information Disclosure",
    summary: "Personal information, credentials and confidential data sent to a model can come back out in its answers, logs or the provider's systems. Send only what the task needs.",
    url: OWASP_URL,
  },
  "owasp-llm03": {
    law: "owasp",
    label: "LLM03 Supply Chain",
    summary: "Third-party models, plugins, tools and packages can be compromised or changed. Pin versions and use sources you trust.",
    url: OWASP_URL,
  },
  "owasp-llm05": {
    law: "owasp",
    label: "LLM05 Improper Output Handling",
    summary: "Model output is untrusted input. Passing it to a shell, eval, SQL or HTML without validation lets whoever controls the prompt run code or inject content.",
    url: OWASP_URL,
  },
  "owasp-llm06": {
    law: "owasp",
    label: "LLM06 Excessive Agency",
    summary: "An AI agent with more tools, permissions or autonomy than its task needs can be steered into damaging actions. Limit its tools and permissions, and require a person to approve high-impact actions.",
    url: OWASP_URL,
  },
  "owasp-llm07": {
    law: "owasp",
    label: "LLM07 System Prompt Leakage",
    summary: "System prompts can be extracted. Never put credentials or secrets in them, and don't rely on them to enforce security.",
    url: OWASP_URL,
  },
  "cccs-genai": {
    law: "cccs",
    label: "ITSAP.00.041",
    summary: "Set rules for which generative AI tools staff may use and for what, keep sensitive and personal information out of public tools, and protect the accounts and keys used to reach them.",
    url: CCCS_GENAI_URL,
  },
} as const satisfies Record<string, Section>;

export type SectionId = keyof typeof SECTIONS;

export const HEALTH_SECTIONS: SectionId[] = [
  "health-qc", "health-on", "health-ab", "health-sk", "health-mb", "health-nb",
  "health-ns", "health-nl", "health-pe", "health-yt", "health-nt",
];

export const GUIDANCE: Guidance[] = ["opc", "owasp", "cccs"];

const PROVINCIAL_LAW: Partial<Record<Province, Law>> = { QC: "law25", AB: "pipa-ab", BC: "pipa-bc" };
const HEALTH_LAW: Partial<Record<Province, Law>> = {
  QC: "health-qc", ON: "health-on", AB: "health-ab", SK: "health-sk", MB: "health-mb", NB: "health-nb",
  NS: "health-ns", NL: "health-nl", PE: "health-pe", YT: "health-yt", NT: "health-nt",
};

/**
 * PIPEDA applies everywhere for commercial activity across borders, so it's
 * always included. Provincial private sector and health laws follow where the
 * people whose information you handle live.
 */
export function lawsFor(provinces: Province[], health: boolean): Law[] {
  const laws = new Set<Law>(["pipeda"]);
  for (const p of provinces) {
    const general = PROVINCIAL_LAW[p];
    if (general) laws.add(general);
    const healthLaw = HEALTH_LAW[p];
    if (health && healthLaw) laws.add(healthLaw);
  }
  return [...laws];
}

export function isSectionId(id: string): id is SectionId {
  return Object.hasOwn(SECTIONS, id);
}

function inScope(source: Source, laws: Law[]): boolean {
  return (GUIDANCE as string[]).includes(source) || laws.includes(source as Law);
}

export function sectionsFor(ids: string[], laws: Law[]): Section[] {
  return ids.filter(isSectionId).map((id) => SECTIONS[id]).filter((s) => inScope(s.law, laws));
}

export function cite(ids: string[], laws: Law[]): string {
  return sectionsFor(ids, laws)
    .map((s) => `[${LAW_NAMES[s.law]} ${s.label}](${s.url})`)
    .join(" · ");
}

export const DISCLAIMER =
  "Informational, not legal advice. This review reads code changes; it can't see your contracts, where a vendor actually processes data, or what your privacy policy says. Have the person in charge of personal information confirm anything that matters.";
