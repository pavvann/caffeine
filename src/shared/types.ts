// Wire types shared between main and renderer.

export type SessionStatus = "idle" | "running" | "paused" | "stopping" | "error";

export type ToolCallEvent = {
  kind: "tool-call";
  id: string;
  name: string;
  input: unknown;
  startedAt: number;
};

export type ToolResultEvent = {
  kind: "tool-result";
  id: string;
  output: unknown;
  isError: boolean;
  finishedAt: number;
};

export type AssistantTextEvent = {
  kind: "assistant-text";
  id: string;
  text: string;
  at: number;
};

export type StatusEvent = {
  kind: "status";
  status: SessionStatus;
  reason?: string;
  at: number;
};

export type CostEvent = {
  kind: "cost";
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costUsd: number;
};

export type StateFileEvent = {
  kind: "state-file";
  content: string;
};

// Pipeline-mode events. Wire-only; the renderer turns these into the
// status-bar string `Task <i>/<n> · <stage> · iteration <k>`.
//
// `Pipeline` is imported lazily from the main-process pipeline types
// to avoid a renderer dependency on parser/orchestrator code. The
// shape is duplicated here as `PipelineWireShape` so the renderer can
// type-check without importing main-process modules.

export type PipelineWireShape = {
  per_task: string[];
  on_backlog_complete: { run: string }[];
  decider: {
    max_iterations: number;
    cost_ceiling_per_iteration_usd?: number;
  };
};

export type PipelineStartedEvent = {
  kind: "pipeline-started";
  pipeline: PipelineWireShape;
};

export type StageStartedEvent = {
  kind: "stage-started";
  /** 1-indexed position among the iteration's unchecked tasks. */
  taskIndex: number;
  /** Total unchecked tasks at the start of this iteration. */
  taskTotal: number;
  stageName: string;
};

export type StageCompletedEvent = {
  kind: "stage-completed";
  taskIndex: number;
  taskTotal: number;
  stageName: string;
  durationMs: number;
};

export type IterationStartedEvent = {
  kind: "iteration-started";
  iteration: number;
};

export type IterationDecidedEvent = {
  kind: "iteration-decided";
  iteration: number;
  decision: "done" | "loop" | "halt";
};

export type SessionEvent =
  | ToolCallEvent
  | ToolResultEvent
  | AssistantTextEvent
  | StatusEvent
  | CostEvent
  | StateFileEvent
  | PipelineStartedEvent
  | StageStartedEvent
  | StageCompletedEvent
  | IterationStartedEvent
  | IterationDecidedEvent;

export type Project = {
  id: string;
  name: string;
  path: string;
  lastSessionId: string | null;
  lastOpenedAt: number;
};

export type CaffeineConfig = {
  verification?: {
    test?: string;
    build?: string;
    lint?: string;
    typecheck?: string;
  };
  model?: string;
  costCeilingUsd?: number;
};

// IPC channel names — keep in sync with main/ipc.ts
export const IPC = {
  // commands (renderer → main)
  ProjectOpen: "project:open",
  ProjectList: "project:list",
  BacklogRead: "backlog:read",
  BacklogWrite: "backlog:write",
  StateRead: "state:read",
  PipelineRead: "pipeline:read",
  PipelineWrite: "pipeline:write",
  PipelineReadRaw: "pipeline:read-raw",
  PipelineWriteRaw: "pipeline:write-raw",
  ConfigRead: "config:read",
  ConfigWrite: "config:write",
  SessionStart: "session:start",
  SessionPause: "session:pause",
  SessionStop: "session:stop",
  SessionIntervene: "session:intervene",
  // events (main → renderer, broadcast on the same channel)
  SessionEvent: "session:event",
} as const;
