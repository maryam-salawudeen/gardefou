import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Vendor } from "./types.js";

// vendors.json is shared with law25-transfer-mapper. packages.json adds SDK
// names and the vendors that code adds but a website scan rarely sees.
const DATA_DIR = fileURLToPath(new URL("../data/", import.meta.url));

export interface VendorDb {
  vendors: Vendor[];
  byHost(host: string): Vendor | null;
  byPackage(ecosystem: "npm" | "pypi", name: string): Vendor | null;
}

export function loadVendors(dir = DATA_DIR): VendorDb {
  const base = JSON.parse(readFileSync(dir + "vendors.json", "utf8")) as { vendors: Vendor[] };
  const extra = JSON.parse(readFileSync(dir + "packages.json", "utf8")) as {
    packages: Record<string, Vendor["packages"]>;
    vendors: Vendor[];
  };
  const vendors = [...base.vendors, ...extra.vendors].map((v) => ({
    ...v,
    packages: v.packages ?? extra.packages[v.id],
  }));
  return createVendorDb(vendors);
}

export function createVendorDb(vendors: Vendor[]): VendorDb {
  // The most specific host wins, so "analytics.google.com" beats "google.com".
  const hosts = vendors
    .flatMap((vendor) => vendor.domains.filter((d) => !d.includes("/")).map((d) => ({ vendor, host: d.toLowerCase() })))
    .sort((a, b) => b.host.length - a.host.length);

  const packages = new Map<string, Vendor>();
  for (const vendor of vendors) {
    for (const eco of ["npm", "pypi"] as const) {
      for (const name of vendor.packages?.[eco] ?? []) packages.set(`${eco}:${normalize(eco, name)}`, vendor);
    }
  }

  return {
    vendors,
    byHost(host) {
      const h = host.toLowerCase();
      return hosts.find((p) => h === p.host || h.endsWith("." + p.host))?.vendor ?? null;
    },
    byPackage(ecosystem, name) {
      return packages.get(`${ecosystem}:${normalize(ecosystem, name)}`) ?? null;
    },
  };
}

// PyPI treats "-", "_" and "." as the same character and ignores case.
function normalize(ecosystem: "npm" | "pypi", name: string): string {
  return ecosystem === "pypi" ? name.toLowerCase().replace(/[-_.]+/g, "-") : name;
}

const COUNTRY_NAMES = new Intl.DisplayNames(["en"], { type: "region" });
const PROVINCES: Record<string, string> = {
  AB: "Alberta",
  BC: "British Columbia",
  MB: "Manitoba",
  NB: "New Brunswick",
  NL: "Newfoundland and Labrador",
  NS: "Nova Scotia",
  NT: "Northwest Territories",
  NU: "Nunavut",
  ON: "Ontario",
  PE: "Prince Edward Island",
  QC: "Québec",
  SK: "Saskatchewan",
  YT: "Yukon",
};

export function describeHq(hq: Vendor["hq"]): string {
  if (!hq) return "headquarters not confirmed";
  if (hq.country === "CA" && hq.region) return `${PROVINCES[hq.region] ?? hq.region}, Canada`;
  return COUNTRY_NAMES.of(hq.country) ?? hq.country;
}

/** Law 25 s. 17 applies to anything leaving Québec, other provinces included. */
export function outsideQuebec(hq: Vendor["hq"]): "yes" | "no" | "unknown" {
  if (!hq) return "unknown";
  return hq.country === "CA" && hq.region === "QC" ? "no" : "yes";
}

export function outsideCanada(hq: Vendor["hq"]): "yes" | "no" | "unknown" {
  if (!hq) return "unknown";
  return hq.country === "CA" ? "no" : "yes";
}

const PROFILING = new Set(["analytics", "advertising", "session-replay", "experimentation", "marketing-automation", "social"]);

export function isProfiling(vendor: Vendor): boolean {
  return vendor.profiling ?? PROFILING.has(vendor.category);
}
