import { create } from "zustand";
import type {
  AssistantTextEvent,
  CostEvent,
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

  // view routing — single-session app, so a tiny enum is enough for now
  view: "session" | "backlog" | "state" | "settings";
  setView: (v: Store["view"]) => void;

  ingest: (event: SessionEvent) => void;
  reset: () => void;
};

const emptyCost: Cost = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  costUsd: 0,
};

export const useStore = create<Store>((set) => ({
  project: null,
  setProject: (project) => set({ project }),

  status: "idle",
  statusReason: null,
  rows: [],
  cost: emptyCost,
  stateFile: "",
  view: "session",

  setView: (v) => set({ view: v }),

  ingest: (event) =>
    set((s) => {
      switch (event.kind) {
        case "status":
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
      }
    }),

  reset: () =>
    set({
      status: "idle",
      statusReason: null,
      rows: [],
      cost: emptyCost,
      stateFile: "",
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
