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
 * Build the full hook config. The cwd is captured by closure so the Stop
 * hook can re-read BACKLOG.md to decide whether to keep the agent going.
 */
export function buildHooks(targetRepoPath: string): Partial<
  Record<HookEvent, HookCallbackMatcher[]>
> {
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
          async (): Promise<HookJSONOutput> => {
            // The long-run trick: if BACKLOG.md still has unchecked
            // items, refuse the stop so the agent has to keep going.
            const open = await countOpenBacklogItems(targetRepoPath);
            if (open > 0) {
              return {
                decision: "block",
                reason: `BACKLOG.md still has ${open} unchecked task(s). Continue with the protocol — pick the next task.`,
              };
            }

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

async function countOpenBacklogItems(repo: string): Promise<number> {
  try {
    const text = await readFile(join(repo, "BACKLOG.md"), "utf8");
    const matches = text.match(/^\s*[-*]\s+\[\s\]\s+/gm);
    return matches?.length ?? 0;
  } catch {
    return 0;
  }
}
