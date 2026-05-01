// Integration-ish tests for `runPipeline`. Real BACKLOG.md / pipeline.md
// in a tmpdir; the SDK is not involved — we stub `bus.push` and
// `query`, substitute `runCommand` for the e2e shell call, and inject
// a `waitForBacklogDrain` so tests don't poll the disk for state the
// agent (which isn't running here) would normally produce.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Query } from "@anthropic-ai/claude-agent-sdk";
import { runPipeline } from "./orchestrator";
import { PromptBus } from "../agent/promptBus";
import type { Pipeline } from "./types";
import type { AgenticDecisionInput, DeciderOutput } from "./decider";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "caffeine-orch-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const stubQuery: Query = { interrupt: async () => {} } as unknown as Query;

function makePipeline(over: Partial<Pipeline> = {}): Pipeline {
  return {
    per_task: ["reviewer", "tester"],
    on_backlog_complete: [{ run: "echo ok" }],
    decider: { max_iterations: 2 },
    ...over,
  };
}

async function seedBacklog(content: string): Promise<void> {
  await writeFile(join(dir, "BACKLOG.md"), content, "utf8");
}

const drainImmediately = async (): Promise<void> => undefined;

/**
 * Default test stub for the agentic-decision flow. Mirrors the pure
 * `decide()` logic so tests that don't care about the agentic path
 * keep their old semantics. Tests exercising the agentic path
 * (loop_tasks, custom reasons) override this with a tailored stub.
 */
const decideStub = async (args: AgenticDecisionInput): Promise<DeciderOutput> => {
  if (args.e2eExitCode === 0) return { decision: "done", reason: "e2e ok" };
  if (args.iteration < args.maxIterations) {
    return { decision: "loop", reason: "e2e failed; retrying" };
  }
  return { decision: "halt", reason: "max_iterations reached" };
};

describe("runPipeline", () => {
  it("(a) happy path: 2-task pipeline, all stages succeed → BACKLOG drains, decider returns done", async () => {
    await seedBacklog(
      "# Backlog\n\n- [ ] task one\n- [ ] task two\n",
    );
    const pipeline = makePipeline();
    const bus = new PromptBus();
    const pushSpy = vi.spyOn(bus, "push");
    const runCommand = vi.fn().mockResolvedValue(0);
    const decisions: Array<{ i: number; d: string }> = [];

    // Simulate the agent draining the backlog: when the orchestrator
    // calls waitForBacklogDrain, mark every item as checked.
    const waitForBacklogDrain = vi.fn(async () => {
      const md = await readFile(join(dir, "BACKLOG.md"), "utf8");
      await writeFile(
        join(dir, "BACKLOG.md"),
        md.replace(/- \[ \]/g, "- [x]"),
        "utf8",
      );
    });

    await runPipeline(pipeline, dir, bus, stubQuery, {
      runCommand,
      waitForBacklogDrain,
      requestDecision: decideStub,
      onIterationDecided: (i, d) => decisions.push({ i, d }),
    });

    // 2 unchecked items × 2 stages = 4 pushed prompts
    expect(pushSpy).toHaveBeenCalledTimes(4);
    expect(waitForBacklogDrain).toHaveBeenCalledTimes(1);
    expect(runCommand).toHaveBeenCalledTimes(1);
    expect(decisions).toEqual([{ i: 1, d: "done" }]);

    const finalBacklog = await readFile(join(dir, "BACKLOG.md"), "utf8");
    expect(finalBacklog).not.toContain("- [ ]");
  });

  it("(b) waitForBacklogDrain throws → orchestrator surfaces the error and halts", async () => {
    await seedBacklog("# Backlog\n\n- [ ] task one\n");
    const pipeline = makePipeline();
    const bus = new PromptBus();
    const runCommand = vi.fn().mockResolvedValue(0);
    const stageError = new Error("tester subagent crashed");
    const waitForBacklogDrain = vi.fn().mockRejectedValue(stageError);

    await expect(
      runPipeline(pipeline, dir, bus, stubQuery, {
        runCommand,
        waitForBacklogDrain,
        requestDecision: decideStub,
      }),
    ).rejects.toThrow(/tester subagent crashed/);

    // e2e command must NOT have run — the orchestrator halted before it.
    expect(runCommand).not.toHaveBeenCalled();
  });

  it("(c) decider returns 'loop' → BACKLOG.md gains a [LOOP-1] task and a second iteration runs", async () => {
    await seedBacklog("# Backlog\n\n- [x] done item\n");
    const pipeline = makePipeline({
      on_backlog_complete: [{ run: "false-cmd" }],
      decider: { max_iterations: 2 },
    });
    const bus = new PromptBus();
    const runCommand = vi.fn()
      .mockResolvedValueOnce(1) // iteration 1: fails → loop
      .mockResolvedValueOnce(0); // iteration 2: succeeds → done

    const iterationStarts: number[] = [];
    // First iter: backlog already drained (only [x] item), no waiting.
    // After [LOOP-1] line is appended in iter 1, iter 2 sees an unchecked
    // item — drain stub marks it checked so iter 2 reaches the e2e step.
    const waitForBacklogDrain = vi.fn(async () => {
      const md = await readFile(join(dir, "BACKLOG.md"), "utf8");
      await writeFile(
        join(dir, "BACKLOG.md"),
        md.replace(/- \[ \]/g, "- [x]"),
        "utf8",
      );
    });

    await runPipeline(pipeline, dir, bus, stubQuery, {
      runCommand,
      waitForBacklogDrain,
      requestDecision: decideStub,
      onIterationStart: (i) => iterationStarts.push(i),
    });

    expect(iterationStarts).toEqual([1, 2]);
    expect(runCommand).toHaveBeenCalledTimes(2);
    const out = await readFile(join(dir, "BACKLOG.md"), "utf8");
    expect(out).toContain("[LOOP-1]");
    expect(out).toContain("`false-cmd` exited 1");
  });

  it("(d) decider supplies targeted loop_tasks → those replace raw failure summaries in BACKLOG.md", async () => {
    await seedBacklog("# Backlog\n\n- [x] done item\n");
    const pipeline = makePipeline({
      on_backlog_complete: [{ run: "false-cmd" }],
      decider: { max_iterations: 2 },
    });
    const bus = new PromptBus();
    const runCommand = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);

    const waitForBacklogDrain = vi.fn(async () => {
      const md = await readFile(join(dir, "BACKLOG.md"), "utf8");
      await writeFile(
        join(dir, "BACKLOG.md"),
        md.replace(/- \[ \]/g, "- [x]"),
        "utf8",
      );
    });

    // Agentic decider returns targeted tasks instead of raw exit-code summaries.
    const targetedDecider = async (
      args: AgenticDecisionInput,
    ): Promise<DeciderOutput> => {
      if (args.iteration === 1) {
        return {
          decision: "loop",
          reason: "auth.test.ts:42 fixture missing",
          loop_tasks: [
            "Add User fixture in src/auth.test.ts:1-10",
            "Update beforeEach in src/auth.test.ts:42 to use the fixture",
          ],
        };
      }
      return { decision: "done", reason: "fixed" };
    };

    await runPipeline(pipeline, dir, bus, stubQuery, {
      runCommand,
      waitForBacklogDrain,
      requestDecision: targetedDecider,
    });

    const out = await readFile(join(dir, "BACKLOG.md"), "utf8");
    expect(out).toContain("[LOOP-1] Add User fixture in src/auth.test.ts:1-10");
    expect(out).toContain(
      "[LOOP-1] Update beforeEach in src/auth.test.ts:42 to use the fixture",
    );
    // The raw exit-code summary must NOT appear when the decider provided targeted tasks.
    expect(out).not.toContain("`false-cmd` exited 1");
  });

  it("hits max_iterations and halts when e2e never succeeds", async () => {
    await seedBacklog("# Backlog\n\n- [x] done\n");
    const pipeline = makePipeline({
      on_backlog_complete: [{ run: "always-fails" }],
      decider: { max_iterations: 2 },
    });
    const bus = new PromptBus();
    const runCommand = vi.fn().mockResolvedValue(1);
    const waitForBacklogDrain = vi.fn(async () => {
      const md = await readFile(join(dir, "BACKLOG.md"), "utf8");
      await writeFile(
        join(dir, "BACKLOG.md"),
        md.replace(/- \[ \]/g, "- [x]"),
        "utf8",
      );
    });

    const decisions: string[] = [];
    await runPipeline(pipeline, dir, bus, stubQuery, {
      runCommand,
      waitForBacklogDrain,
      requestDecision: decideStub,
      onIterationDecided: (_i, d) => decisions.push(d),
    });

    expect(decisions).toEqual(["loop", "halt"]);
    expect(runCommand).toHaveBeenCalledTimes(2);
  });

  it("emits onStageStart with stable BACKLOG.md line indices, not filtered positions", async () => {
    await seedBacklog(
      [
        "# Backlog",
        "", // line 1 blank
        "- [x] already done", // line 2
        "- [ ] first open", // line 3
        "- [x] middle done", // line 4
        "- [ ] second open", // line 5
        "",
      ].join("\n"),
    );
    const pipeline = makePipeline({ per_task: ["reviewer"] });
    const bus = new PromptBus();
    const runCommand = vi.fn().mockResolvedValue(0);
    const waitForBacklogDrain = vi.fn(async () => {
      const md = await readFile(join(dir, "BACKLOG.md"), "utf8");
      await writeFile(
        join(dir, "BACKLOG.md"),
        md.replace(/- \[ \]/g, "- [x]"),
        "utf8",
      );
    });

    const stages: Array<{ taskIndex: number; stageName: string }> = [];
    await runPipeline(pipeline, dir, bus, stubQuery, {
      runCommand,
      waitForBacklogDrain,
      requestDecision: decideStub,
      onStageStart: (taskIndex, stageName) => stages.push({ taskIndex, stageName }),
    });

    expect(stages.map((s) => s.taskIndex)).toEqual([3, 5]);
  });

  it("returns promptly when the abort signal fires mid-drain", async () => {
    await seedBacklog("# Backlog\n\n- [ ] open task\n");
    const pipeline = makePipeline();
    const bus = new PromptBus();
    const ac = new AbortController();
    const runCommand = vi.fn().mockResolvedValue(0);

    // The drain stub waits forever — the only way out is via abort.
    const waitForBacklogDrain = vi.fn(
      (_p: string, signal?: AbortSignal) =>
        new Promise<void>((resolve) => {
          signal?.addEventListener("abort", () => resolve());
        }),
    );

    const promise = runPipeline(pipeline, dir, bus, stubQuery, {
      runCommand,
      waitForBacklogDrain,
      requestDecision: decideStub,
      signal: ac.signal,
    });

    // Fire abort on next tick.
    setTimeout(() => ac.abort(), 10);

    await promise;

    // e2e command must NOT have been called — orchestrator bailed
    // before the on_backlog_complete step.
    expect(runCommand).not.toHaveBeenCalled();
  });

  it("clears a stale completion marker at the start so the next run isn't short-circuited", async () => {
    // Simulate a previous run by pre-creating the marker file.
    await writeFile(join(dir, ".caffeine-pipeline-complete"), "", "utf8");
    await seedBacklog("# Backlog\n\n- [x] done\n");

    const pipeline = makePipeline({
      on_backlog_complete: [{ run: "echo ok" }],
    });
    const bus = new PromptBus();
    const runCommand = vi.fn().mockResolvedValue(0);

    // Track marker presence as observed across the run.
    const observedDuringRun: boolean[] = [];
    const waitForBacklogDrain = vi.fn(async () => {
      // No unchecked items, so drain is a no-op; record a snapshot
      // of marker presence just before e2e runs.
      observedDuringRun.push(
        await readFile(join(dir, ".caffeine-pipeline-complete"), "utf8")
          .then(() => true)
          .catch(() => false),
      );
    });

    await runPipeline(pipeline, dir, bus, stubQuery, {
      runCommand,
      waitForBacklogDrain,
      requestDecision: decideStub,
    });

    // Marker should be re-written after the orchestrator decides done.
    const exists = await readFile(
      join(dir, ".caffeine-pipeline-complete"),
      "utf8",
    ).then(() => true).catch(() => false);
    expect(exists).toBe(true);
    // No drain expected because backlog had no unchecked items, so
    // the in-run snapshot is empty — the assertion below documents
    // intent: the run finished normally (didn't short-circuit on
    // the stale marker before reaching the e2e command).
    expect(runCommand).toHaveBeenCalledTimes(1);
    expect(observedDuringRun).toEqual([]);
  });
});
