import type { DiffFile } from "./types.js";

/**
 * Parses a unified diff (`git diff` or the GitHub `.diff` media type).
 * Only added lines are kept with their new-file line numbers, because a review
 * comment can only point at a line that exists after the change.
 */
export function parseDiff(text: string): DiffFile[] {
  const files: DiffFile[] = [];
  let current: DiffFile | null = null;
  let newLine = 0;
  let inHunk = false;

  for (const raw of text.split("\n")) {
    const line = raw.replace(/\r$/, "");

    if (line.startsWith("diff --git ")) {
      const match = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
      current = { path: match?.[2] ?? "", status: "modified", added: [], patch: "" };
      files.push(current);
      inHunk = false;
      continue;
    }
    if (!current) continue;

    if (!inHunk) {
      if (line.startsWith("new file mode")) current.status = "added";
      else if (line.startsWith("deleted file mode")) current.status = "deleted";
      else if (line.startsWith("rename to ")) {
        current.status = "renamed";
        current.path = line.slice("rename to ".length);
      } else if (line.startsWith("+++ ")) {
        const target = line.slice(4);
        if (target !== "/dev/null") current.path = target.replace(/^b\//, "");
      }
    }

    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      newLine = Number(hunk[1]);
      inHunk = true;
      current.patch += line + "\n";
      continue;
    }
    if (!inHunk) continue;

    if (line.startsWith("+")) {
      current.added.push({ line: newLine, text: line.slice(1) });
      current.patch += line + "\n";
      newLine++;
    } else if (line.startsWith("-")) {
      current.patch += line + "\n";
    } else if (line.startsWith(" ") || line === "") {
      current.patch += line + "\n";
      newLine++;
    } else if (line.startsWith("\\")) {
      // "\ No newline at end of file"
    }
  }

  return files.filter((f) => f.path && f.status !== "deleted");
}
