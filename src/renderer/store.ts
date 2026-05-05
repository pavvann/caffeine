import { create } from "zustand";
import type {
  AssistantTextEvent,
  CostEvent,
  PipelineWireShape,
  Project,
  SessionEvent,
  SessionStatus,
  ToolCallEvent,
  ToolResultEvent,
} from "@shared/types";

// One unified row type for the transcript so the view can render a flat
// list. Tool calls and results are merged into a single "tool" row with
// progressive state (pending → done|error).
export type TranscriptRow =
  | { kind: "text"; id: string; text: string; at: number }
  | {
      kind: "tool";
      id: string;
      name: string;
      input: unknown;
      output: unknown | null;
      status: "pending" | "done" | "error";
      startedAt: number;
      finishedAt: number | null;
    };

type Cost = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costUsd: number;
};

type Store = {
  project: Project | null;
  setProject: (p: Project | null) => void;

  status: SessionStatus;
  statusReason: string | null;
  rows: TranscriptRow[];
  cost: Cost;
  stateFile: string;

  // Pipeline mode state. `currentPipeline` is null outside pipeline
  // mode. The other fields are valid only while `currentPipeline` is
  // non-null; the StatusBar reads them defensively.
  currentPipeline: PipelineWireShape | null;
  currentTaskIndex: number;
  currentTaskTotal: number;
  currentStage: string | null;
  currentIteration: number;
  /**
   * Last decision the orchestrator emitted (`done`/`loop`/`halt`).
   * `null` until any iteration has decided. The StatusBar uses this
   * to surface a halt — without it, halt is indistinguishable from
   * a clean done from the user's perspective.
   */
  lastDecision: "done" | "loop" | "halt" | null;

  // view routing — single-session app, so a tiny enum is enough for now
  view: "session" | "backlog" | "pipeline" | "state" | "settings";
  setView: (v: Store["view"]) => void;

  ingest: (event: SessionEvent) => void;
  /**
   * Replay a batch of historical events into the store (for restoring
   * the transcript when the user reopens a project). Filters status
   * and subagent-state events because those describe lifecycle that
   * isn't current — the live status bar reflects "no session running"
   * after a restart, not the historical session's last status.
   *
   * Resets transcript-derived fields (rows, cost, stateFile, pipeline
   * state) before replaying so reopening a project doesn't accumulate
   * across runs.
   */
  hydrateHistory: (events: SessionEvent[]) => void;
  reset: () => void;
};

const emptyCost: Cost = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  costUsd: 0,
};

export const useStore = create<Store>((set, get) => ({
  project: null,
  setProject: (project) => set({ project }),

  status: "idle",
  statusReason: null,
  rows: [],
  cost: emptyCost,
  stateFile: "",
  currentPipeline: null,
  currentTaskIndex: -1,
  currentTaskTotal: 0,
  currentStage: null,
  currentIteration: 0,
  lastDecision: null,
  view: "session",

  setView: (v) => set({ view: v }),

  ingest: (event) =>
    set((s) => {
      switch (event.kind) {
        case "status":
          // A transition into `running` marks a session boundary.
          // Clear pipeline state so a fresh session doesn't inherit
          // stale fields from the previous run.
          if (event.status === "running") {
            return {
              status: event.status,
              statusReason: event.reason ?? null,
              currentPipeline: null,
              currentTaskIndex: -1,
              currentTaskTotal: 0,
              currentStage: null,
              currentIteration: 0,
              lastDecision: null,
            };
          }
          return {
            status: event.status,
            statusReason: event.reason ?? null,
          };
        case "cost":
          return {
            cost: {
              inputTokens: event.inputTokens,
              outputTokens: event.outputTokens,
              cacheReadTokens: event.cacheReadTokens,
              cacheCreationTokens: event.cacheCreationTokens,
              // result events are cumulative-per-turn; sum them for a session total
              costUsd: s.cost.costUsd + event.costUsd,
            },
          };
        case "state-file":
          return { stateFile: event.content };
        case "assistant-text": {
          const row = textRow(event);
          return { rows: [...s.rows, row] };
        }
        case "tool-call": {
          const row = toolRowFromCall(event);
          return { rows: [...s.rows, row] };
        }
        case "tool-result": {
          return { rows: applyToolResult(s.rows, event) };
        }
        case "pipeline-started":
          return { currentPipeline: event.pipeline };
        case "iteration-started":
          return { currentIteration: event.iteration };
        case "iteration-decided":
          return { lastDecision: event.decision };
        case "stage-started":
          // Only update task counters here. `stageName` carried on
          // this event is the last *queued* stage, not the running
          // one — the orchestrator pushes all per_task prompts onto
          // the bus in a tight loop, so this event fires N times in
          // rapid succession at the start of each task. The actual
          // running-stage highlight is driven by `subagent-state`
          // events from the SDK's SubagentStart/SubagentStop hooks.
          return {
            currentTaskIndex: event.taskIndex,
            currentTaskTotal: event.taskTotal,
          };
        case "stage-completed":
          return {};
        case "subagent-state":
          return { currentStage: event.running };
      }
    }),

  hydrateHistory: (events) => {
    // Reset only transcript-derived fields; preserve project, status,
    // view selection, etc. (the user is opening a project, not
    // changing identity or navigation).
    set({
      rows: [],
      cost: emptyCost,
      stateFile: "",
      currentPipeline: null,
      currentTaskIndex: -1,
      currentTaskTotal: 0,
      currentStage: null,
      currentIteration: 0,
      lastDecision: null,
    });
    const ingest = get().ingest;
    for (const event of events) {
      // Skip lifecycle/transient events — they describe a session
      // that already ended, not the current state.
      if (event.kind === "status") continue;
      if (event.kind === "subagent-state") continue;
      ingest(event);
    }
  },

  reset: () =>
    set({
      status: "idle",
      statusReason: null,
      rows: [],
      cost: emptyCost,
      stateFile: "",
      currentPipeline: null,
      currentTaskIndex: -1,
      currentTaskTotal: 0,
      currentStage: null,
      currentIteration: 0,
      lastDecision: null,
    }),
}));

function textRow(e: AssistantTextEvent): TranscriptRow {
  return { kind: "text", id: e.id, text: e.text, at: e.at };
}

function toolRowFromCall(e: ToolCallEvent): TranscriptRow {
  return {
    kind: "tool",
    id: e.id,
    name: e.name,
    input: e.input,
    output: null,
    status: "pending",
    startedAt: e.startedAt,
    finishedAt: null,
  };
}

function applyToolResult(
  rows: TranscriptRow[],
  e: ToolResultEvent,
): TranscriptRow[] {
  // Walk in reverse — tool results almost always pair with the most recent
  // tool call of that id, and the array is append-only.
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (r.kind === "tool" && r.id === e.id) {
      const updated: TranscriptRow = {
        ...r,
        output: e.output,
        status: e.isError ? "error" : "done",
        finishedAt: e.finishedAt,
      };
      const next = rows.slice();
      next[i] = updated;
      return next;
    }
  }
  // Result with no matching call (shouldn't happen, but don't crash). Append a synthetic row.
  return [
    ...rows,
    {
      kind: "tool",
      id: e.id,
      name: "(unknown)",
      input: null,
      output: e.output,
      status: e.isError ? "error" : "done",
      startedAt: e.finishedAt,
      finishedAt: e.finishedAt,
    },
  ];
}
