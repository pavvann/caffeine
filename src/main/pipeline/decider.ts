// Decision logic for the pipeline orchestrator's loop.
//
// Two layers, by design:
//
//   1. `decide()` — pure function. Deterministic mapping from
//      (e2eExitCode, currentIteration, maxIterations) to "done" /
//      "loop" / "halt". Used as the fallback when the agentic decider
//      times out or gets aborted, so the orchestrator never hangs.
//
//   2. `requestAgenticDecision()` — pushes a prompt onto the bus
//      asking the main agent to invoke the `decider` subagent
//      (`src/main/agent/decider-agent.ts`). The decider writes a
//      structured JSON block to STATE.md under a per-iteration
//      heading. We poll STATE.md until the block appears, then parse
//      it via `parseDeciderOutput()`. On timeout or abort, fall back
//      to `decide()` so the loop always terminates.
//
// The orchestrator wires `requestAgenticDecision` as the default
// `requestDecision` hook; tests inject a synchronous stub that bypasses
// the bus and STATE.md round-trip entirely.
//
// No I/O in `decide()`. No I/O in `parseDeciderOutput()`.
// `requestAgenticDecision()` is the only thing here that touches the
// filesystem.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { PromptBus } from "../agent/promptBus";

export type DeciderInput = {
  /** Final non-zero exit code from the e2e command chain, or 0 on success. */
  e2eExitCode: number;
  /** 1-indexed counter — first run is iteration 1. */
  currentIteration: number;
  /** Hard cap from `pipeline.decider.max_iterations`. Must be >= 1. */
  maxIterations: number;
};

export type Decision = "done" | "loop" | "halt";

/**
 * Structured output the decider agent writes to STATE.md. Also the
 * shape returned by the agentic decision flow even when we fall back
 * to the deterministic logic — `loop_tasks` is left undefined in that
 * case and the orchestrator falls back to raw failure summaries.
 */
export type DeciderOutput = {
  decision: Decision;
  reason: string;
  loop_tasks?: string[];
};

export function decide(args: DeciderInput): Decision {
  if (args.e2eExitCode === 0) return "done";
  if (args.currentIteration < args.maxIterations) return "loop";
  return "halt";
}

const DECIDER_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const DECIDER_POLL_MS = 750;

export type AgenticDecisionInput = {
  iteration: number;
  maxIterations: number;
  e2eExitCode: number;
  failures: string[];
  repoPath: string;
  bus: PromptBus;
  signal?: AbortSignal;
  /**
   * Test/override hook — when provided, called instead of the bus +
   * polling round-trip. Production leaves this undefined; the
   * orchestrator's own RunPipelineOptions also exposes a top-level
   * `requestDecision` override that swaps this whole function out.
   */
  override?: () => Promise<DeciderOutput>;
  /** Optional override of poll/timeout for tests. */
  pollMs?: number;
  timeoutMs?: number;
};

/**
 * Default agentic-decision flow. Pushes a prompt onto the bus
 * instructing the main agent to invoke the `decider` subagent, then
 * polls STATE.md until the decider's output section appears. Falls
 * back to the deterministic `decide()` if the decider times out, gets
 * aborted, or writes unparseable output.
 */
export async function requestAgenticDecision(
  args: AgenticDecisionInput,
): Promise<DeciderOutput> {
  if (args.override) return args.override();

  const failureList =
    args.failures.length > 0
      ? args.failures.map((f) => `  - ${f}`).join("\n")
      : "  (none — all on_backlog_complete commands exited 0)";

  args.bus.push(
    `Pipeline iteration ${args.iteration}/${args.maxIterations} just finished its on_backlog_complete stage.\n` +
      `Final exit code: ${args.e2eExitCode}\n` +
      `Failed commands:\n${failureList}\n\n` +
      `Invoke the 'decider' subagent via the Agent tool. In the Agent tool's description ` +
      `include all of the following so the subagent can do its job:\n` +
      `- Iteration number: ${args.iteration}\n` +
      `- Maximum iterations: ${args.maxIterations}\n` +
      `- Final exit code: ${args.e2eExitCode}\n` +
      `- Failed commands: ${args.failures.length > 0 ? args.failures.join("; ") : "none"}\n\n` +
      `The decider will read STATE.md, decide done/loop/halt, and write a JSON code block ` +
      `to STATE.md under the heading "## Decider Output: Iteration ${args.iteration}". ` +
      `After the subagent finishes, you may stop — the orchestrator picks up from STATE.md.`,
  );

  const timeoutMs = args.timeoutMs ?? DECIDER_TIMEOUT_MS;
  const pollMs = args.pollMs ?? DECIDER_POLL_MS;
  const startedAt = Date.now();

  while (!args.signal?.aborted && Date.now() - startedAt < timeoutMs) {
    const state = await readFile(
      join(args.repoPath, "STATE.md"),
      "utf8",
    ).catch(() => "");
    const parsed = parseDeciderOutput(state, args.iteration);
    if (parsed) return parsed;
    await delay(pollMs, undefined, { signal: args.signal }).catch(() => {});
  }

  // Timeout or abort: deterministic fallback so the loop always terminates.
  return {
    decision: decide({
      e2eExitCode: args.e2eExitCode,
      currentIteration: args.iteration,
      maxIterations: args.maxIterations,
    }),
    reason: args.signal?.aborted
      ? "decider request aborted; using deterministic fallback"
      : "decider agent timed out; using deterministic fallback",
  };
}

/**
 * Extract the decider's structured output for a specific iteration from
 * STATE.md content. Returns `null` if no output is present yet, or if
 * the output is malformed (caller treats both as "keep waiting" or
 * "fall back to deterministic logic" depending on context).
 *
 * Shape contract is whatever `DECIDER_AGENT.prompt` instructs the agent
 * to produce. Defensive parsing — invalid `decision` values, missing
 * fields, non-array `loop_tasks` all yield `null` rather than partial
 * results.
 */
export function parseDeciderOutput(
  stateFileContent: string,
  iteration: number,
): DeciderOutput | null {
  // Exact-match the heading so `Iteration 1` does not collide with
  // `Iteration 10`. The heading must end at a non-digit boundary
  // (newline, whitespace, or end of string).
  const headingRe = new RegExp(
    `^## Decider Output: Iteration ${iteration}(?=\\s|$)`,
    "m",
  );
  const headingMatch = headingRe.exec(stateFileContent);
  if (!headingMatch) return null;

  // Scan for the next ```json ... ``` fenced block after the heading.
  // Prose between heading and fence is allowed and ignored.
  const after = stateFileContent.slice(
    headingMatch.index + headingMatch[0].length,
  );
  const fenceMatch = after.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (!fenceMatch) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(fenceMatch[1]);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;

  const decision = obj.decision;
  if (decision !== "done" && decision !== "loop" && decision !== "halt") {
    return null;
  }

  const reason = typeof obj.reason === "string" ? obj.reason : "";

  let loop_tasks: string[] | undefined;
  if (Array.isArray(obj.loop_tasks)) {
    loop_tasks = obj.loop_tasks.filter(
      (t): t is string => typeof t === "string" && t.trim().length > 0,
    );
    if (loop_tasks.length === 0) loop_tasks = undefined;
  }

  // Spec consistency: "loop" without targeted tasks is allowed (the
  // orchestrator falls back to raw failure summaries), but "done" /
  // "halt" with loop_tasks is suspicious. Drop them silently in that
  // case rather than rejecting the whole decision.
  if (decision !== "loop") loop_tasks = undefined;

  return { decision, reason, loop_tasks };
}
