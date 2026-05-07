import { readFile, access } from "node:fs/promises";
import { join } from "node:path";
import { BrowserWindow, dialog } from "electron";
import type {
  HookCallbackMatcher,
  HookEvent,
  HookJSONOutput,
} from "@anthropic-ai/claude-agent-sdk";
import { emitSessionEvent } from "../ipc";
import type { ToolCallEvent, ToolResultEvent } from "@shared/types";

// Pattern-match destructive shell commands. PreToolUse logs them; in M10
// they'll prompt for UI confirmation.
const DESTRUCTIVE_BASH_PATTERNS = [
  /\brm\s+-rf?\b/,
  /\bgit\s+push\s+(-f|--force\b)/,
  /\bgit\s+reset\s+--hard\b/,
  /\bgit\s+clean\s+-f/,
  /\bDROP\s+(TABLE|DATABASE|SCHEMA)\b/i,
  /\bTRUNCATE\s+TABLE\b/i,
  /\b:\(\)\s*\{\s*:\|/,            // fork bomb
  /\bdd\s+if=.*of=\/dev\//,
];

function isDestructiveBash(input: unknown): boolean {
  if (!input || typeof input !== "object") return false;
  const cmd = (input as { command?: unknown }).command;
  if (typeof cmd !== "string") return false;
  return DESTRUCTIVE_BASH_PATTERNS.some((re) => re.test(cmd));
}

/**
 * After the Stop hook has blocked this many times in a row WITHOUT any
 * change to BACKLOG.md or to the agent's last assistant message, we let
 * the agent stop. The hook was originally designed to keep the agent
 * grinding through real work; without this escape, an agent that has
 * correctly identified that all remaining tasks are external blockers
 * (waiting on the user, waiting on an upstream patch) gets stuck in a
 * "Awaiting your input." spam loop because the hook keeps refusing the
 * stop. Three strikes = the agent has reached a fixed point. Let it go.
 */
const STUCK_THRESHOLD = 3;

/**
 * Build the full hook config. The cwd is captured by closure so the Stop
 * hook can re-read BACKLOG.md to decide whether to keep the agent going.
 *
 * The closure also tracks per-session "stuck" state for the fixed-point
 * detector — whenever buildHooks is called for a fresh session, those
 * counters reset.
 */
export function buildHooks(targetRepoPath: string): Partial<
  Record<HookEvent, HookCallbackMatcher[]>
> {
  let stuckCount = 0;
  let lastSignature = "";
  return {
    PreToolUse: [
      {
        hooks: [
          async (input): Promise<HookJSONOutput> => {
            if (input.hook_event_name !== "PreToolUse") return {};
            const event: ToolCallEvent = {
              kind: "tool-call",
              id: input.tool_use_id,
              name: input.tool_name,
              input: input.tool_input,
              startedAt: Date.now(),
            };
            emitSessionEvent(event);

            if (input.tool_name === "Bash" && isDestructiveBash(input.tool_input)) {
              const cmd = (input.tool_input as { command?: string }).command ?? "";
              const allowed = await confirmDestructive(cmd);
              if (!allowed) {
                return {
                  decision: "block",
                  reason: `Destructive command blocked by user: ${cmd}`,
                };
              }
            }
            return {};
          },
        ],
      },
    ],
    PostToolUse: [
      {
        hooks: [
          async (input): Promise<HookJSONOutput> => {
            if (input.hook_event_name !== "PostToolUse") return {};
            const event: ToolResultEvent = {
              kind: "tool-result",
              id: input.tool_use_id,
              output: input.tool_response,
              isError: false, // SDK reports errors via PostToolUseFailure
              finishedAt: Date.now(),
            };
            emitSessionEvent(event);
            return {};
          },
        ],
      },
    ],
    PostToolUseFailure: [
      {
        hooks: [
          async (input): Promise<HookJSONOutput> => {
            if (input.hook_event_name !== "PostToolUseFailure") return {};
            const event: ToolResultEvent = {
              kind: "tool-result",
              id: input.tool_use_id,
              output: (input as unknown as { tool_response?: unknown }).tool_response,
              isError: true,
              finishedAt: Date.now(),
            };
            emitSessionEvent(event);
            return {};
          },
        ],
      },
    ],
    SubagentStart: [
      {
        hooks: [
          async (input): Promise<HookJSONOutput> => {
            if (input.hook_event_name !== "SubagentStart") return {};
            // Tracks the actually-running subagent for the Pipeline
            // view's per_task lane highlight. The orchestrator's
            // stage-started events fire at queue-time (all stages
            // for a task get queued in a tight loop), so they can't
            // be used for live highlighting.
            emitSessionEvent({
              kind: "subagent-state",
              running: input.agent_type,
            });
            return {};
          },
        ],
      },
    ],
    SubagentStop: [
      {
        hooks: [
          async (input): Promise<HookJSONOutput> => {
            if (input.hook_event_name !== "SubagentStop") return {};
            emitSessionEvent({ kind: "subagent-state", running: null });
            return {};
          },
        ],
      },
    ],
    Stop: [
      {
        hooks: [
          async (input): Promise<HookJSONOutput> => {
            // Read BACKLOG.md once per hook fire — both the unchecked
            // count and the fixed-point signature derive from the same
            // content. Reading twice would double the I/O and trip
            // mocked test fixtures that use `mockResolvedValueOnce`.
            const backlog = await readBacklogText(targetRepoPath);
            const open = countOpenItems(backlog);
            if (open > 0) {
              // Fixed-point detector. Build a signature from BACKLOG.md
              // contents + the agent's last assistant message. If we've
              // blocked the same signature STUCK_THRESHOLD times in a
              // row, the agent is making no progress and the right
              // thing is to let it stop — the user will see whatever
              // the agent's final message was and can intervene.
              const stopInput =
                input.hook_event_name === "Stop" ? input : null;
              const signature = computeStuckSignature(
                backlog,
                stopInput?.last_assistant_message ?? "",
              );
              if (signature === lastSignature) {
                stuckCount++;
              } else {
                stuckCount = 1;
                lastSignature = signature;
              }

              if (stuckCount >= STUCK_THRESHOLD) {
                // Reset so a fresh stuck-loop later in the session
                // gets its own three strikes.
                stuckCount = 0;
                lastSignature = "";
                emitSessionEvent({
                  kind: "status",
                  status: "idle",
                  reason: `Agent halted with ${open} task(s) still open — appears stuck waiting on user input. Read the last message and intervene if you can unblock it.`,
                  at: Date.now(),
                });
                return {};
              }

              return {
                decision: "block",
                reason: `BACKLOG.md still has ${open} unchecked task(s). Continue with the protocol — pick the next task. If you genuinely cannot make progress on the remaining tasks (external blockers, waiting on user, etc.), say so once and stop trying; the runner will detect the fixed point.`,
              };
            }

            // No open items — reset the fixed-point detector for any
            // future stuck-loop in this session.
            stuckCount = 0;
            lastSignature = "";

            // Pipeline-mode extension: if `pipeline.md` is present and
            // the orchestrator has NOT yet dropped its completion
            // marker, hold the agent open so the orchestrator can run
            // `on_backlog_complete` and (optionally) loop with new
            // [LOOP-N] tasks. Outside pipeline mode, this branch is
            // skipped and v1 behavior is preserved exactly.
            if (await fileExists(join(targetRepoPath, "pipeline.md"))) {
              if (!(await fileExists(join(targetRepoPath, PIPELINE_DONE_MARKER)))) {
                return {
                  decision: "block",
                  reason: "Backlog complete, run on_backlog_complete stages",
                };
              }
            }
            return {};
          },
        ],
      },
    ],
  };
}

/**
 * Path the orchestrator drops on disk (relative to the target repo)
 * once `runPipeline` returns. The Stop hook treats this file as the
 * "pipeline mode is truly done — let the agent stop" sentinel.
 */
export const PIPELINE_DONE_MARKER = ".caffeine-pipeline-complete";

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function confirmDestructive(command: string): Promise<boolean> {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return false;
  const { response } = await dialog.showMessageBox(win, {
    type: "warning",
    title: "Destructive command",
    message: "The agent wants to run a destructive shell command.",
    detail: command,
    buttons: ["Block", "Allow once"],
    defaultId: 0,
    cancelId: 0,
  });
  return response === 1;
}

async function readBacklogText(repo: string): Promise<string> {
  try {
    return await readFile(join(repo, "BACKLOG.md"), "utf8");
  } catch {
    return "";
  }
}

function countOpenItems(backlog: string): number {
  // Top-level only — no leading whitespace. Indented `- [ ] AC: ...`
  // rows are acceptance criteria belonging to a task, not standalone
  // backlog tasks; counting them would let the Stop hook keep the
  // agent grinding until every individual AC checkbox is ticked,
  // which double-counts the work and breaks the closing protocol
  // (parent tick = all ACs already ticked).
  const matches = backlog.match(/^[-*]\s+\[\s\]\s+/gm);
  return matches?.length ?? 0;
}

/**
 * Cheap content-fingerprint of (BACKLOG.md state + last agent message).
 * Used by the Stop hook to detect a fixed point — when the same
 * signature appears N times in a row, the agent is stuck and we should
 * let it actually stop. Not a cryptographic hash; we just want a stable
 * string we can `===` compare across hook fires.
 */
function computeStuckSignature(
  backlog: string,
  lastAssistantMessage: string,
): string {
  // Use the full backlog content rather than just length — flipping a
  // checkbox from `[ ]` to `[x]` keeps the file the same length, so a
  // length-only fingerprint would falsely report "no progress" on what
  // is in fact real progress. The strings are small (typical BACKLOG.md
  // is single-digit KB) and we're just `===` comparing across calls.
  // Trim the last message to 256 chars so an unusually long final
  // assistant message doesn't dominate the comparison; that's enough
  // to distinguish "Awaiting your input." from real reasoning.
  const tail = (lastAssistantMessage ?? "").slice(0, 256);
  return `${backlog} ${tail}`;
}
