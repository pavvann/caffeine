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

export type SessionEvent =
  | ToolCallEvent
  | ToolResultEvent
  | AssistantTextEvent
  | StatusEvent
  | CostEvent
  | StateFileEvent;

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
  ConfigRead: "config:read",
  ConfigWrite: "config:write",
  SessionStart: "session:start",
  SessionPause: "session:pause",
  SessionStop: "session:stop",
  SessionIntervene: "session:intervene",
  // events (main → renderer, broadcast on the same channel)
  SessionEvent: "session:event",
} as const;
