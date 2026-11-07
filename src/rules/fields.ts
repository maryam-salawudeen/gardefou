import { HEALTH_SECTIONS } from "../law.js";
import type { DiffFile, Finding } from "../types.js";
import { categoryOf, type PiCategory } from "./pi.js";
import { isComment, isSchemaFile, truncate } from "./util.js";

// Shapes that declare a stored field rather than use one:
//   dateOfBirth: string        sin VARCHAR(9)        dob DateTime
//   date_of_birth = models.DateField()               name="health_card"
//   add_column :users, :sin    t.string :sin         Column("sin", ...)
const DECLARATIONS: RegExp[] = [
  /^\s*(?:(?:export|public|private|protected|readonly|declare)\s+)*["'`]?([A-Za-z_][\w-]*)["'`]?\??\s*:(?!:)/,
  /^\s*["'`]?([A-Za-z_]\w*)["'`]?\s+(?:[A-Z]\w*|(?:var)?char|text|date|datetime|timestamp\w*|int\w*|bigint|numeric|decimal|uuid|bool\w*|jsonb?|bytea|blob)\b/i,
  /^\s*([A-Za-z_]\w*)\s*(?::\s*[\w[\]|. ]+)?=\s*(?:models\.|db\.Column|Column\(|mapped_column\(|fields\.|serializers\.|Field\()/,
  /\b(?:name|id|autocomplete|field|column|key)\s*[=:]\s*["']([A-Za-z_][\w-]*)["']/,
  /\badd_column\s+:\w+\s*,\s*:(\w+)/,
  /\bt\.\w+\s+:(\w+)/,
  /\bColumn\(\s*["'](\w+)["']/,
];

/**
 * Flags newly declared fields that hold personal information, grouped by file
 * and category, so a migration with five contact columns gets one comment.
 */
export function personalInfoFields(files: DiffFile[]): Finding[] {
  const findings: Finding[] = [];

  for (const file of files) {
    const schema = isSchemaFile(file.path);
    const groups = new Map<string, { cat: PiCategory; fields: Set<string>; line: number; evidence: string }>();

    for (const { line, text } of file.added) {
      if (isComment(text)) continue;
      for (const pattern of DECLARATIONS) {
        const name = pattern.exec(text)?.[1];
        if (!name) continue;
        const cat = categoryOf(name);
        if (!cat || (cat.schemaOnly && !schema)) continue;
        const group = groups.get(cat.id) ?? { cat, fields: new Set<string>(), line, evidence: truncate(text) };
        group.fields.add(name);
        groups.set(cat.id, group);
        break;
      }
    }

    for (const { cat, fields, line, evidence } of groups.values()) {
      findings.push(toFinding(file.path, cat, [...fields], line, evidence));
    }
  }
  return findings;
}

function toFinding(path: string, cat: PiCategory, fields: string[], line: number, evidence: string): Finding {
  const list = fields.map((f) => `\`${f}\``).join(", ");
  const paragraphs = [
    `This adds ${cat.label}: ${list}. Collect it only if the purpose needs it, and write the purpose down before you start collecting.`,
  ];
  if (cat.sensitive) {
    paragraphs.push(
      "This is sensitive information. It needs stronger safeguards, and using it for any new purpose needs express consent.",
    );
  }
  if (cat.note) paragraphs.push(cat.note);
  paragraphs.push("Decide how long you'll keep it and how it gets deleted or anonymized when you no longer need it.");

  const sections = ["law25-s4", "pipeda-4.4", "pipa-ab-s11", "pipa-bc-s11", "law25-s23", "pipeda-4.5.3"];
  if (cat.sensitive) sections.splice(4, 0, "law25-s12", "pipeda-4.3");
  // Cited only when the config says health information acts apply.
  if (cat.id === "health" || cat.id === "government-id") sections.push(...HEALTH_SECTIONS);

  return {
    rule: "personal-info-field",
    severity: cat.severity,
    path,
    line,
    title: `New ${cat.label} field${fields.length > 1 ? "s" : ""}`,
    body: paragraphs.join("\n\n"),
    sections,
    evidence,
  };
}
