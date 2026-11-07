export function isComment(text: string): boolean {
  return /^\s*(\/\/|#(?!\[)|\*|\/\*|<!--|--\s)/.test(text);
}

/** "dateOfBirth", "DateOfBirth" and "date-of-birth" all become "date_of_birth". */
export function normalizeIdentifier(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/[-\s]+/g, "_")
    .toLowerCase();
}

export function identifiers(text: string): string[] {
  return text.match(/[A-Za-z_][A-Za-z0-9_-]*/g) ?? [];
}

/** True when `words` ("date_of_birth") appears as whole underscore-separated segments of `normalized`. */
export function hasSegments(normalized: string, words: string): boolean {
  return `_${normalized}_`.includes(`_${words}_`);
}

// Files where a field name almost certainly declares stored data.
export function isSchemaFile(path: string): boolean {
  return /(migrat|schema|models?[/.]|entit|\.sql$|\.prisma$|\.graphql$|forms?[/.]|dto)/i.test(path);
}

export function truncate(text: string, max = 160): string {
  const t = text.trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}
