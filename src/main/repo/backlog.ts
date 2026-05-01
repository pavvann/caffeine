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
