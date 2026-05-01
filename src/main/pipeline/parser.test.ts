// Tests for `readPipeline`. Each test creates a unique tmpdir,
// optionally drops a `pipeline.md` into it, and asserts on the parser's
// output (or thrown error). No mocks — the real `node:fs/promises` is
// hit. Cleanup happens in `afterEach`.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PipelineParseError, readPipeline } from "./parser";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "caffeine-parser-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function writePipelineFile(body: string): Promise<void> {
  await writeFile(join(dir, "pipeline.md"), body, "utf8");
}

describe("readPipeline", () => {
  it("(a) parses a valid frontmatter into a Pipeline", async () => {
    await writePipelineFile(
      [
        "---",
        "per_task:",
        "  - reviewer",
        "  - security",
        "  - tester",
        "on_backlog_complete:",
        "  - run: pnpm test",
        "  - run: pnpm e2e",
        "decider:",
        "  max_iterations: 3",
        "  cost_ceiling_per_iteration_usd: 5",
        "---",
        "",
        "# Rationale",
        "Markdown body is ignored.",
        "",
      ].join("\n"),
    );

    const pipeline = await readPipeline(dir);

    expect(pipeline).toEqual({
      per_task: ["reviewer", "security", "tester"],
      on_backlog_complete: [{ run: "pnpm test" }, { run: "pnpm e2e" }],
      decider: { max_iterations: 3, cost_ceiling_per_iteration_usd: 5 },
    });
  });

  it("(b) returns null when pipeline.md is missing", async () => {
    // Note: `dir` exists but has no pipeline.md inside.
    const pipeline = await readPipeline(dir);
    expect(pipeline).toBeNull();
  });

  it("(c) throws PipelineParseError when `per_task` is missing", async () => {
    await writePipelineFile(
      [
        "---",
        "on_backlog_complete:",
        "  - run: pnpm test",
        "decider:",
        "  max_iterations: 3",
        "---",
      ].join("\n"),
    );

    await expect(readPipeline(dir)).rejects.toThrow(PipelineParseError);
    await expect(readPipeline(dir)).rejects.toThrow(/per_task/);
  });

  it("(d) throws PipelineParseError on malformed YAML", async () => {
    await writePipelineFile(
      [
        "---",
        "per_task:",
        "  - reviewer",
        "this line is not valid yaml — no colon, not a list item",
        "decider:",
        "  max_iterations: 3",
        "---",
      ].join("\n"),
    );

    await expect(readPipeline(dir)).rejects.toThrow(PipelineParseError);
    // Pin the specific failure mode so a future refactor that causes
    // the same fixture to throw a *different* PipelineParseError is
    // caught here rather than silently stopping coverage of the
    // malformed-mapping-line path.
    await expect(readPipeline(dir)).rejects.toThrow(/malformed YAML/);
  });

  it("(e) throws PipelineParseError when `decider.max_iterations` is a string", async () => {
    await writePipelineFile(
      [
        "---",
        "per_task:",
        "  - reviewer",
        "on_backlog_complete:",
        "  - run: pnpm test",
        "decider:",
        '  max_iterations: "3"',
        "---",
      ].join("\n"),
    );

    await expect(readPipeline(dir)).rejects.toThrow(PipelineParseError);
    await expect(readPipeline(dir)).rejects.toThrow(/max_iterations/);
  });
});
