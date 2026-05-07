// Unit tests for `appendLoopTasks` and `parseBacklog`. Real fs in a tmpdir — no mocks.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { appendLoopTasks, parseBacklog } from "./backlog";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "caffeine-backlog-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const BACKLOG = (s: string) => join(s, "BACKLOG.md");

async function seed(content: string): Promise<void> {
  await writeFile(BACKLOG(dir), content, "utf8");
}

async function read(): Promise<string> {
  return readFile(BACKLOG(dir), "utf8");
}

describe("appendLoopTasks", () => {
  it("appends one line per failure with the [LOOP-N] tag", async () => {
    await seed("# Backlog\n\n- [x] done item\n");

    await appendLoopTasks(dir, 1, ["`pnpm test` exited 1", "`pnpm e2e` exited 2"]);

    const out = await read();
    expect(out).toContain("- [ ] [LOOP-1] `pnpm test` exited 1");
    expect(out).toContain("- [ ] [LOOP-1] `pnpm e2e` exited 2");
  });

  it("is idempotent: identical failure under same iteration is not duplicated", async () => {
    await seed("# Backlog\n\n- [ ] [LOOP-1] `pnpm test` exited 1\n");

    await appendLoopTasks(dir, 1, ["`pnpm test` exited 1"]);

    const out = await read();
    const matches = out.match(/\[LOOP-1\] `pnpm test` exited 1/g);
    expect(matches).toHaveLength(1);
  });

  it("does not deduplicate the same failure under a different iteration", async () => {
    await seed("# Backlog\n\n- [ ] [LOOP-1] `pnpm test` exited 1\n");

    await appendLoopTasks(dir, 2, ["`pnpm test` exited 1"]);

    const out = await read();
    expect(out).toContain("[LOOP-1] `pnpm test` exited 1");
    expect(out).toContain("[LOOP-2] `pnpm test` exited 1");
  });

  it("is a no-op when failures is empty", async () => {
    await seed("# Backlog\n\n- [ ] keep me\n");

    await appendLoopTasks(dir, 1, []);

    expect(await read()).toBe("# Backlog\n\n- [ ] keep me\n");
  });

  it("creates a fresh BACKLOG.md when one does not exist", async () => {
    // No seed.
    await appendLoopTasks(dir, 1, ["spawn failed"]);

    const out = await read();
    expect(out).toContain("- [ ] [LOOP-1] spawn failed");
  });

  it("dedups against an already-CHECKED line with the same text", async () => {
    // Documented intent: a previously-resolved failure recurring under
    // the same iteration should not duplicate. Tag-mismatched
    // iterations are still allowed (covered above).
    await seed("# Backlog\n\n- [x] [LOOP-1] `pnpm test` exited 1\n");

    await appendLoopTasks(dir, 1, ["`pnpm test` exited 1"]);

    const out = await read();
    const matches = out.match(/\[LOOP-1\] `pnpm test` exited 1/g);
    expect(matches).toHaveLength(1);
  });

  it("recognizes `*` bullet style for dedup matching", async () => {
    await seed("# Backlog\n\n* [ ] [LOOP-1] `pnpm test` exited 1\n");

    await appendLoopTasks(dir, 1, ["`pnpm test` exited 1"]);

    const out = await read();
    const matches = out.match(/\[LOOP-1\] `pnpm test` exited 1/g);
    expect(matches).toHaveLength(1);
  });

  it("recognizes capital `[X]` checkbox for dedup matching", async () => {
    await seed("# Backlog\n\n- [X] [LOOP-1] `pnpm test` exited 1\n");

    await appendLoopTasks(dir, 1, ["`pnpm test` exited 1"]);

    const out = await read();
    const matches = out.match(/\[LOOP-1\] `pnpm test` exited 1/g);
    expect(matches).toHaveLength(1);
  });
});

describe("parseBacklog", () => {
  it("returns one item per top-level checkbox; ignores indented sub-bullets without AC: prefix", () => {
    const md = [
      "# Backlog",
      "",
      "- [ ] First task",
      "  - [ ] decorative sub-bullet",
      "  - some plain bullet",
      "- [x] Second task",
    ].join("\n");

    const items = parseBacklog(md);
    expect(items).toHaveLength(2);
    expect(items[0].text).toBe("First task");
    expect(items[0].checked).toBe(false);
    expect(items[0].acceptanceCriteria).toEqual([]);
    expect(items[1].text).toBe("Second task");
    expect(items[1].checked).toBe(true);
  });

  it("attaches indented `- [ ] AC: ...` rows as acceptanceCriteria of the preceding task", () => {
    const md = [
      "- [ ] Build OAuth login",
      "  - [ ] AC: User completes Google sign-in end-to-end",
      "  - [ ] AC: Failed auth shows error toast",
      "  - [x] AC: Session persists across app restart",
      "- [ ] Add password reset",
      "  - [ ] AC: Reset email contains a single-use token",
    ].join("\n");

    const items = parseBacklog(md);
    expect(items).toHaveLength(2);
    expect(items[0].acceptanceCriteria).toEqual([
      {
        lineIndex: 1,
        text: "User completes Google sign-in end-to-end",
        checked: false,
      },
      {
        lineIndex: 2,
        text: "Failed auth shows error toast",
        checked: false,
      },
      {
        lineIndex: 3,
        text: "Session persists across app restart",
        checked: true,
      },
    ]);
    expect(items[1].acceptanceCriteria).toEqual([
      {
        lineIndex: 5,
        text: "Reset email contains a single-use token",
        checked: false,
      },
    ]);
  });

  it("does not attach AC rows that appear before any task", () => {
    // Stray indented AC at the top of the file should be dropped, not
    // attached to a phantom task or promoted to a top-level item.
    const md = [
      "  - [ ] AC: orphan criterion",
      "- [ ] Real task",
    ].join("\n");

    const items = parseBacklog(md);
    expect(items).toHaveLength(1);
    expect(items[0].text).toBe("Real task");
    expect(items[0].acceptanceCriteria).toEqual([]);
  });

  it("treats indented checkboxes WITHOUT the `AC:` prefix as decorative (dropped)", () => {
    const md = [
      "- [ ] Task with mixed nesting",
      "  - [ ] decorative subtask without AC prefix",
      "  - [ ] AC: real criterion",
    ].join("\n");

    const items = parseBacklog(md);
    expect(items).toHaveLength(1);
    expect(items[0].acceptanceCriteria).toHaveLength(1);
    expect(items[0].acceptanceCriteria[0].text).toBe("real criterion");
  });

  it("recognizes `*` as well as `-` for both task and AC bullets", () => {
    const md = [
      "* [ ] Star task",
      "  * [ ] AC: star criterion",
    ].join("\n");

    const items = parseBacklog(md);
    expect(items).toHaveLength(1);
    expect(items[0].acceptanceCriteria).toHaveLength(1);
  });
});
