// Pipeline orchestrator. Runs once per session when `pipeline.md` is
// present. For each iteration it:
//
//   1. Walks every unchecked BACKLOG.md item and pushes the per-task
//      stage prompts onto the agent's PromptBus.
//   2. Waits for the agent to drain the backlog (every item checked).
//      That synchronization is necessary because step 3 must observe
//      the *post-agent* state of the repo, not the pre-agent state.
//   3. Runs each `on_backlog_complete[i].run` shell command in order
//      and feeds the final exit code to `decide()`.
//   4. On `loop`, appends `[LOOP-N]` failure summaries to BACKLOG.md
//      and starts the next iteration. On `done`/`halt`, returns.
//
// The orchestrator does NOT drive the SDK directly — that's the
// runner's job. We push prompts the agent will consume, then observe
// effects (BACKLOG.md mutations, STATE.md findings) on disk.

import { spawn } from "node:child_process";
import { unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { Query } from "@anthropic-ai/claude-agent-sdk";
import { appendLoopTasks, parseBacklog, readBacklog } from "../repo/backlog";
import { PIPELINE_DONE_MARKER } from "../agent/hooks";
import type { PromptBus } from "../agent/promptBus";
import type { Pipeline } from "./types";
import {
  type AgenticDecisionInput,
  type DeciderOutput,
  requestAgenticDecision,
} from "./decider";
import { emitSessionEvent } from "../ipc";

export type RunPipelineOptions = {
  /**
   * Override for shell-spawning. Tests inject a fake to avoid touching
   * `child_process`. Returns the exit code (0 success, non-zero
   * failure). Default uses `defaultRunCommand`.
   */
  runCommand?: (cmd: string, cwd: string) => Promise<number>;

  /**
   * Override for waiting until BACKLOG.md has no unchecked items.
   * Tests inject either an immediate resolve, or a rejection to model
   * "an agent stage threw." The default polls BACKLOG.md every 500ms
   * and aborts when `signal` fires.
   */
  waitForBacklogDrain?: (
    repoPath: string,
    signal?: AbortSignal,
  ) => Promise<void>;

  /**
   * Abort signal wired from the runner's session-level abort
   * controller. When fired, the default drain-poller bails out and
   * `runPipeline` resolves promptly so the runner's `Promise.all`
   * settles and the bus can be closed.
   */
  signal?: AbortSignal;

  /** Hook fired before each iteration — used by tests + IPC events. */
  onIterationStart?: (iteration: number) => void;
  /**
   * Hook fired before each per_task stage prompt is pushed. The
   * `taskIndex` is the BACKLOG.md *line index* (stable across edits),
   * not a position within the unchecked-items list.
   */
  onStageStart?: (taskIndex: number, stageName: string) => void;
  /**
   * Hook fired after the decider returns each iteration. Tests use this
   * for assertions; production wires `emitSessionEvent`.
   */
  onIterationDecided?: (
    iteration: number,
    decision: "done" | "loop" | "halt",
  ) => void;

  /**
   * Override for the iteration-end decision flow. Default
   * (`requestAgenticDecision` from `./decider`) pushes a prompt onto
   * the bus asking the main agent to invoke the `decider` subagent,
   * then polls STATE.md for the structured output. Tests inject a
   * synchronous stub that returns a `DeciderOutput` directly,
   * bypassing the bus and STATE.md round trip entirely.
   */
  requestDecision?: (args: AgenticDecisionInput) => Promise<DeciderOutput>;
};

/**
 * Run the orchestration loop. Returns when the decider says we're
 * `"done"` or we hit `"halt"`.
 *
 * `query` is currently unused but retained in the signature per the
 * task spec — passed through from the runner so the orchestrator can
 * adopt it later (e.g. interrupting the SDK between iterations) without
 * a breaking change.
 */
export async function runPipeline(
  pipeline: Pipeline,
  repoPath: string,
  bus: PromptBus,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _query: Query,
  options: RunPipelineOptions = {},
): Promise<void> {
  const runCommand = options.runCommand ?? defaultRunCommand;
  const waitForDrain =
    options.waitForBacklogDrain ?? pollBacklogDrain;
  const requestDecision =
    options.requestDecision ?? requestAgenticDecision;
  const signal = options.signal;

  // Clear any leftover completion marker from a previous run. Without
  // this the Stop hook would see the stale marker on the very first
  // iteration and let the agent terminate immediately.
  await unlink(join(repoPath, PIPELINE_DONE_MARKER)).catch(() => {});

  // Announce pipeline mode to the renderer. Tests don't go through
  // the IPC layer (emitSessionEvent is a no-op when no window is
  // registered), so this is harmless under test.
  emitSessionEvent({ kind: "pipeline-started", pipeline });

  for (let iteration = 1; iteration <= pipeline.decider.max_iterations; iteration++) {
    if (signal?.aborted) return;
    options.onIterationStart?.(iteration);
    emitSessionEvent({ kind: "iteration-started", iteration });

    // 1. Queue prompts for every currently-unchecked backlog item.
    //    Per task we push three beats in strict order:
    //
    //      a. Implement — main agent does the work, stages the diff.
    //      b. per_task stages — reviewer/security/tester subagents
    //         run AGAINST the staged diff from (a).
    //      c. Close — agent ticks the BACKLOG.md checkbox and writes
    //         a Lessons Learned line in STATE.md.
    //
    //    Without (a), the stages would run on an empty diff (the
    //    bug fixed in v0.0.4). The agent processes bus messages
    //    serially, so queueing all three beats per task in this
    //    order is enough — no inter-beat synchronization needed.
    const backlog = await readBacklog(repoPath);
    const items = parseBacklog(backlog);
    const open = items.filter((item) => !item.checked);

    for (let i = 0; i < open.length; i++) {
      const item = open[i];
      const position = i + 1; // 1-indexed for the renderer's "Task X/Y"
      const total = open.length;

      // a. Implementer beat. The v1 system prompt also tells the agent
      //    to read STATE.md and follow the protocol, but the orchestrator
      //    asserts authoritatively here so the agent doesn't drift into
      //    running stages on un-implemented work.
      bus.push(
        `Pipeline iteration ${iteration}, task ${position}/${total}: "${item.text}".\n\n` +
          `Step 1 — IMPLEMENT this task.\n` +
          `- Read STATE.md if you need context from prior tasks.\n` +
          `- Plan subtasks under "## Current Task" in STATE.md if non-trivial.\n` +
          `- Make the actual code changes that satisfy the task description.\n` +
          `- Run the verification commands listed in caffeine.config.json after meaningful edits. Do not proceed past a red gate.\n\n` +
          `Step 2 — STAGE your changes with \`git add -A\` so the per_task subagents can read the staged diff.\n\n` +
          `Do NOT tick the BACKLOG.md checkbox yet. The per_task stages run on your work next, ` +
          `and a closing prompt will instruct you to tick the box once they pass.`,
      );

      // b. Per_task stage beats. One bus message per registered stage.
      for (const stageName of pipeline.per_task) {
        // Test hook receives the BACKLOG.md line index (stable);
        // the IPC event carries the 1-indexed position + total
        // because that's what the StatusBar's `Task X/Y` display
        // needs. The two semantics are intentionally distinct.
        options.onStageStart?.(item.lineIndex, stageName);
        emitSessionEvent({
          kind: "stage-started",
          taskIndex: position,
          taskTotal: total,
          stageName,
        });
        bus.push(
          `Run the ${stageName} stage on the just-implemented task "${item.text}". ` +
            `Invoke the ${stageName} subagent via the Agent tool, pass it the staged diff, ` +
            `and ensure its findings reach STATE.md before you proceed.`,
        );
        // We deliberately do NOT emit `stage-completed` here.
        // The orchestrator queues the prompt onto the bus but has
        // no visibility into when the agent actually finishes the
        // stage; emitting completion at enqueue time would lie about
        // duration and ordering. A future phase can add a real
        // completion signal (e.g. STATE.md polling or a hook tap).
      }

      // c. Closing beat. Without this the agent might leave the
      //    checkbox unchecked even after stages pass, which keeps the
      //    Stop hook blocking forever.
      bus.push(
        `All ${pipeline.per_task.length} per_task stage(s) have completed for "${item.text}".\n\n` +
          `If any stage flagged real issues in STATE.md that you have not yet addressed, ` +
          `fix them now and re-run the relevant stage(s). Otherwise:\n` +
          `1. Tick the checkbox in BACKLOG.md for this task.\n` +
          `2. Append a 1-2 line note to STATE.md under "## Lessons Learned".\n` +
          `3. The orchestrator will queue the next task or end-of-iteration commands shortly.`,
      );
    }

    // 2. Wait for the agent to drain the backlog. The runner's Stop
    //    hook (Phase 3 task #13) is what enforces "agent must keep
    //    going while BACKLOG has unchecked items." `waitForDrain`
    //    rejects if a stage agent throws — propagating that rejection
    //    halts the orchestrator and surfaces the error to the runner.
    if (open.length > 0) {
      await waitForDrain(repoPath, signal);
      if (signal?.aborted) return;
    }

    // 3. Run on_backlog_complete commands. First non-zero exit wins as
    //    the e2e exit code; subsequent commands still run so we can
    //    capture all failures for the [LOOP-N] summary.
    let e2eExitCode = 0;
    const failures: string[] = [];
    for (const step of pipeline.on_backlog_complete) {
      const code = await runCommand(step.run, repoPath);
      if (code !== 0) {
        e2eExitCode = code;
        failures.push(`\`${step.run}\` exited ${code}`);
      }
    }

    // 4. Request a decision. The agentic decider reads STATE.md +
    //    diff and authors targeted [LOOP-N] tasks; the deterministic
    //    fallback (timeout/abort) just maps exit code to "done"/"loop"/
    //    "halt" without targeted tasks.
    const deciderResult = await requestDecision({
      iteration,
      maxIterations: pipeline.decider.max_iterations,
      e2eExitCode,
      failures,
      repoPath,
      bus,
      signal,
    });
    const decision = deciderResult.decision;
    options.onIterationDecided?.(iteration, decision);
    emitSessionEvent({ kind: "iteration-decided", iteration, decision });

    if (decision === "done" || decision === "halt") {
      // Drop the completion marker so the runner's Stop hook lets the
      // agent terminate. Both `done` and `halt` are terminal — the
      // pipeline is finished even if the result was a halt.
      await writeFile(join(repoPath, PIPELINE_DONE_MARKER), "", "utf8");
      return;
    }
    // 5. decision === "loop". Prefer the decider's targeted tasks; if
    //    it didn't supply any (deterministic fallback path), fall back
    //    to raw failure summaries so the next iteration still has
    //    SOMETHING actionable in BACKLOG.md.
    const tasksToAppend =
      deciderResult.loop_tasks && deciderResult.loop_tasks.length > 0
        ? deciderResult.loop_tasks
        : failures;
    if (tasksToAppend.length > 0) {
      await appendLoopTasks(repoPath, iteration, tasksToAppend);
    }
  }
  // Loop exhausted without an explicit halt (e.g. e2e success on the
  // last iteration). Drop the marker as well.
  await writeFile(join(repoPath, PIPELINE_DONE_MARKER), "", "utf8");
}

/**
 * Default poll-based BACKLOG.md drain. Resolves when there are zero
 * unchecked items, or when `signal` aborts. The runner pipes its
 * session-level AbortController through so a user-initiated stop
 * unblocks the orchestrator promptly.
 */
async function pollBacklogDrain(
  repoPath: string,
  signal?: AbortSignal,
): Promise<void> {
  const intervalMs = 500;
  while (!signal?.aborted) {
    const md = await readBacklog(repoPath);
    const open = parseBacklog(md).filter((i) => !i.checked);
    if (open.length === 0) return;
    await delay(intervalMs, undefined, { signal }).catch(() => {});
  }
}

/**
 * Default `child_process.spawn`-based command runner. Inherits stdio
 * so the user sees command output streamed live. Resolves with the
 * exit code; signal-kill is reported as 128 so the failure summary
 * distinguishes it from a clean non-zero exit.
 */
function defaultRunCommand(cmd: string, cwd: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cmd, { cwd, shell: true, stdio: "inherit" });
    child.on("error", () => resolve(1));
    child.on("exit", (code, signal) => {
      if (typeof code === "number") resolve(code);
      else if (signal) resolve(128); // signal-kill: caller sees a non-zero
      else resolve(1);
    });
  });
}
