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

export type AcceptanceCriterion = {
  lineIndex: number;
  text: string;
  checked: boolean;
};

export type BacklogItem = {
  /** Index into the full markdown line array — useful for stable keys & toggling. */
  lineIndex: number;
  text: string;
  checked: boolean;
  /**
   * Indented `- [ ] AC: <criterion>` rows that follow this task. Used by
   * the implementer to plan against, by the critic to verify, and by the
   * decider to author targeted [LOOP-N] tasks. Nested checkboxes WITHOUT
   * the `AC:` prefix are decorative and ignored.
   */
  acceptanceCriteria: AcceptanceCriterion[];
};

const TOP_LEVEL_TASK_RE = /^[-*]\s+\[([ xX])\]\s+(.*)$/;
const NESTED_AC_RE = /^\s+[-*]\s+\[([ xX])\]\s+AC:\s*(.*)$/;

/**
 * Parse a BACKLOG.md into the structured task list shown in the UI.
 *
 * Top-level checkboxes (zero leading whitespace) are tasks. Indented
 * `- [ ] AC: <criterion>` rows under a task become `acceptanceCriteria`
 * on that task. Other indented checkboxes are decorative and dropped.
 *
 * Returning ACs as a sub-collection (instead of as additional top-level
 * items) is what keeps the Stop hook and orchestrator drain-check from
 * treating every criterion as a standalone backlog task.
 */
export function parseBacklog(markdown: string): BacklogItem[] {
  const lines = markdown.split(/\r?\n/);
  const items: BacklogItem[] = [];
  let current: BacklogItem | null = null;
  lines.forEach((line, i) => {
    const top = line.match(TOP_LEVEL_TASK_RE);
    if (top) {
      current = {
        lineIndex: i,
        checked: top[1].toLowerCase() === "x",
        text: top[2],
        acceptanceCriteria: [],
      };
      items.push(current);
      return;
    }
    if (!current) return;
    const ac = line.match(NESTED_AC_RE);
    if (ac) {
      current.acceptanceCriteria.push({
        lineIndex: i,
        text: ac[2],
        checked: ac[1].toLowerCase() === "x",
      });
    }
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
