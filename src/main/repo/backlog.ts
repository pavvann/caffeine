import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const FILENAME = "BACKLOG.md";
const SEED = `# Backlog

Caffeine reads this file to know what to work on next. Add tasks below as
GitHub-style checkboxes. The agent picks the top unchecked item, executes the
protocol, and ticks the box when done.

- [ ] (your first task here)
`;

export async function readBacklog(repoPath: string): Promise<string> {
  const path = join(repoPath, FILENAME);
  if (!existsSync(path)) {
    await writeFile(path, SEED, "utf8");
    return SEED;
  }
  return readFile(path, "utf8");
}

export async function writeBacklog(
  repoPath: string,
  content: string,
): Promise<void> {
  await writeFile(join(repoPath, FILENAME), content, "utf8");
}

export type BacklogItem = {
  /** Index into the full markdown line array — useful for stable keys & toggling. */
  lineIndex: number;
  text: string;
  checked: boolean;
};

/** Parse a BACKLOG.md into the structured task list shown in the UI. */
export function parseBacklog(markdown: string): BacklogItem[] {
  const lines = markdown.split(/\r?\n/);
  const items: BacklogItem[] = [];
  const re = /^\s*[-*]\s+\[([ xX])\]\s+(.*)$/;
  lines.forEach((line, i) => {
    const m = line.match(re);
    if (!m) return;
    items.push({
      lineIndex: i,
      checked: m[1].toLowerCase() === "x",
      text: m[2],
    });
  });
  return items;
}

/** Toggle the checked state of the item at the given line index. */
export function toggleItem(markdown: string, lineIndex: number): string {
  const lines = markdown.split(/\r?\n/);
  if (lineIndex < 0 || lineIndex >= lines.length) return markdown;
  lines[lineIndex] = lines[lineIndex].replace(
    /^(\s*[-*]\s+)\[([ xX])\]/,
    (_, prefix, mark) => `${prefix}[${mark === " " ? "x" : " "}]`,
  );
  return lines.join("\n");
}

/**
 * Append `[LOOP-<iteration>]` tasks to BACKLOG.md, one per failure.
 *
 * Idempotent: if a line with the exact same `[LOOP-<iteration>]
 * <failure>` text is already present (checked or unchecked), it is not
 * duplicated. The check is whole-line: the same failure text under a
 * different iteration counter still gets a fresh line, which is
 * intentional — a failure recurring across iterations is signal worth
 * surfacing.
 *
 * Always writes the file in LF (no trailing CRLF preservation) since
 * the seed and toggleItem already operate on LF.
 */
export async function appendLoopTasks(
  repoPath: string,
  iteration: number,
  failures: string[],
): Promise<void> {
  if (failures.length === 0) return;
  const path = join(repoPath, FILENAME);
  const existing = existsSync(path) ? await readFile(path, "utf8") : SEED;
  const existingLines = existing.split(/\r?\n/);
  const tag = `[LOOP-${iteration}]`;

  const fresh: string[] = [];
  for (const failure of failures) {
    const line = `- [ ] ${tag} ${failure}`;
    const already = existingLines.some(
      (l) => l.replace(/^\s*[-*]\s+\[[ xX]\]\s+/, "").trim() ===
        `${tag} ${failure}`,
    );
    if (!already) fresh.push(line);
  }
  if (fresh.length === 0) return;

  // Ensure exactly one trailing newline before our additions; collapse
  // an empty trailing line if present so we don't accumulate blank
  // lines across iterations.
  const trimmed = existing.replace(/\s*$/, "");
  const next = trimmed + "\n\n" + fresh.join("\n") + "\n";
  await writeFile(path, next, "utf8");
}
