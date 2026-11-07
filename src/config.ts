import { existsSync, readFileSync } from "node:fs";
import picomatch from "picomatch";
import { parse } from "yaml";
import { lawsFor } from "./law.js";
import { PROVINCES, RULE_IDS, type Law, type Province, type RuleId, type Severity } from "./types.js";

export interface ApprovedVendor {
  id: string;
  /** Where the privacy impact assessment or written agreement lives, shown in the comment. */
  pia?: string;
}

export interface AiPolicy {
  /**
   * Vendor ids of the AI providers the company has approved. Empty means no
   * policy: any AI provider is reported as a new recipient like other vendors.
   */
  approvedProviders: string[];
  /** Flag AI calls that don't name a Canadian cloud region. */
  requireCanadianRegion: boolean;
  /** Remove secrets and personal information from the diff before the AI pass sees it. */
  redact: boolean;
}

export interface Config {
  provinces: Province[];
  health: boolean;
  /** Derived from provinces and health. */
  laws: Law[];
  approvedVendors: ApprovedVendor[];
  ai: AiPolicy;
  ignorePaths: string[];
  ignoreRules: RuleId[];
  /** The check fails when a finding at or above this severity remains. */
  failOn: Severity | "none";
  maxComments: number;
}

export const DEFAULT_CONFIG: Config = {
  provinces: [...PROVINCES],
  health: false,
  laws: lawsFor([...PROVINCES], false),
  approvedVendors: [],
  ai: { approvedProviders: [], requireCanadianRegion: false, redact: true },
  ignorePaths: [
    "**/*.md",
    "**/*.lock",
    "**/package-lock.json",
    "**/pnpm-lock.yaml",
    "**/yarn.lock",
    "**/dist/**",
    "**/node_modules/**",
    "**/*.min.js",
    "**/*.snap",
  ],
  ignoreRules: [],
  failOn: "none",
  maxComments: 25,
};

const SEVERITIES = ["high", "medium", "low", "none"] as const;

export const CONFIG_FILE = ".gardefou.yml";

export function loadConfig(path = CONFIG_FILE, warn?: (msg: string) => void): Config {
  if (!existsSync(path)) return DEFAULT_CONFIG;
  return parseConfig(readFileSync(path, "utf8"), warn);
}

/** Bad values are dropped rather than failing the review, and reported through `warn`. */
export function parseConfig(text: string, warn: (msg: string) => void = () => {}): Config {
  const raw = (parse(text) ?? {}) as Record<string, unknown>;
  const config: Config = { ...DEFAULT_CONFIG, ai: { ...DEFAULT_CONFIG.ai } };

  const where = raw.jurisdictions as Record<string, unknown> | undefined;
  if (where) {
    const provinces = where.provinces;
    if (Array.isArray(provinces)) {
      const valid = provinces
        .map((p) => String(p).toUpperCase())
        .filter((p): p is Province => (PROVINCES as readonly string[]).includes(p));
      if (valid.length) config.provinces = valid;
      else warn(`"jurisdictions.provinces" lists none of ${PROVINCES.join(", ")}; using all of them.`);
      if (valid.length < provinces.length) warn(`Ignored unknown province codes in "jurisdictions.provinces".`);
    } else if (provinces !== undefined && provinces !== "all") {
      warn(`"jurisdictions.provinces" must be "all" or a list of province codes.`);
    }
    if (typeof where.health === "boolean") config.health = where.health;
  }
  config.laws = lawsFor(config.provinces, config.health);

  const vendors = (raw.vendors as Record<string, unknown> | undefined)?.approved;
  if (Array.isArray(vendors)) {
    config.approvedVendors = vendors.flatMap((v): ApprovedVendor[] => {
      if (typeof v === "string") return [{ id: v }];
      if (v && typeof v === "object" && typeof (v as ApprovedVendor).id === "string") {
        const { id, pia } = v as ApprovedVendor;
        return [{ id, pia: typeof pia === "string" ? pia : undefined }];
      }
      warn(`Skipped an entry in vendors.approved that has no id.`);
      return [];
    });
  }

  const ai = raw.ai as Record<string, unknown> | undefined;
  if (ai) {
    if (Array.isArray(ai.approved_providers)) config.ai.approvedProviders = ai.approved_providers.map(String);
    if (typeof ai.require_canadian_region === "boolean") config.ai.requireCanadianRegion = ai.require_canadian_region;
    if (typeof ai.redact === "boolean") config.ai.redact = ai.redact;
  }

  const ignore = raw.ignore as Record<string, unknown> | undefined;
  if (Array.isArray(ignore?.paths)) {
    config.ignorePaths = [...DEFAULT_CONFIG.ignorePaths, ...ignore.paths.filter((p): p is string => typeof p === "string")];
  }
  if (Array.isArray(ignore?.rules)) {
    config.ignoreRules = ignore.rules.filter((r): r is RuleId => (RULE_IDS as readonly string[]).includes(r as string));
  }

  if (typeof raw.fail_on === "string") {
    if ((SEVERITIES as readonly string[]).includes(raw.fail_on)) config.failOn = raw.fail_on as Config["failOn"];
    else warn(`"fail_on" must be one of ${SEVERITIES.join(", ")}.`);
  }
  if (typeof raw.max_comments === "number" && raw.max_comments > 0) config.maxComments = Math.floor(raw.max_comments);

  return config;
}

export function pathFilter(config: Config): (path: string) => boolean {
  const ignored = picomatch(config.ignorePaths, { dot: true });
  return (path) => !ignored(path);
}

export function covers(config: Config, province: Province): boolean {
  return config.provinces.includes(province);
}
