import { ipcMain, dialog, type BrowserWindow } from "electron";
import { IPC, type SessionEvent } from "@shared/types";
import { startSession } from "./agent/runner";
import { clearCurrent, getCurrent, setCurrent } from "./agent/state";
import { readBacklog, writeBacklog } from "./repo/backlog";
import { readState, watchState } from "./repo/state";
import { readConfig, writeConfig } from "./repo/config";
import { readPipeline, writePipeline } from "./pipeline/parser";
import type { Pipeline } from "./pipeline/types";
import {
  getLastSessionId,
  listProjects,
  recordSession,
  upsertProject,
} from "./db/queries";
import type { CaffeineConfig } from "@shared/types";

function emit(event: SessionEvent): void {
  emitSessionEvent(event);
}

// v1: single-project, set externally (M8 wires the picker).
// Until then this is mutable so the UI can still hit the backlog handlers
// once a path is provided via SessionStart or a debug shim.
let activeRepoPath: string | null = null;
export function setActiveRepoPath(path: string | null): void {
  activeRepoPath = path;
}

type WindowGetter = () => BrowserWindow | null;

let getWindow: WindowGetter = () => null;

export type SessionStartArgs = {
  targetRepoPath: string;
  model?: string;
  resumeSessionId?: string;
  costCeilingUsd?: number;
};

export function registerIpc(windowGetter: WindowGetter): void {
  getWindow = windowGetter;

  // Project / backlog / state / config / api-key handlers are stubbed
  // until M4–M9 wire them. Returning empty defaults keeps the renderer
  // alive without ceremony.
  ipcMain.handle(IPC.ProjectList, async () => listProjects());
  ipcMain.handle(IPC.ProjectOpen, async (_e, requestedPath: string | null) => {
    let path = requestedPath;
    if (!path) {
      const win = getWindow();
      if (!win) return null;
      const result = await dialog.showOpenDialog(win, {
        properties: ["openDirectory"],
        title: "Pick a target repo",
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      path = result.filePaths[0];
    }
    const project = upsertProject(path);
    setActiveRepoPath(path);
    watchState(path);
    return project;
  });
  ipcMain.handle(IPC.BacklogRead, async () => {
    if (!activeRepoPath) return "";
    return readBacklog(activeRepoPath);
  });
  ipcMain.handle(IPC.BacklogWrite, async (_e, content: string) => {
    if (!activeRepoPath) return false;
    await writeBacklog(activeRepoPath, content);
    return true;
  });
  ipcMain.handle(IPC.StateRead, async () => {
    if (!activeRepoPath) return "";
    return readState(activeRepoPath);
  });
  ipcMain.handle(IPC.PipelineRead, async () => {
    if (!activeRepoPath) return null;
    // Defensive: a malformed pipeline.md would throw PipelineParseError.
    // For the read-only view we swallow that and return null so the UI
    // shows "no pipeline" instead of crashing. Sessions still surface
    // the error properly via runner.ts.
    return readPipeline(activeRepoPath).catch(() => null);
  });
  ipcMain.handle(IPC.PipelineWrite, async (_e, pipeline: Pipeline) => {
    if (!activeRepoPath) {
      return { ok: false, reason: "no-active-project" as const };
    }
    if (getCurrent()) {
      return { ok: false, reason: "session-running" as const };
    }
    try {
      await writePipeline(activeRepoPath, pipeline);
      return { ok: true as const };
    } catch (err) {
      return {
        ok: false as const,
        reason: err instanceof Error ? err.message : String(err),
      };
    }
  });
  ipcMain.handle(IPC.PipelineReadRaw, async () => {
    if (!activeRepoPath) return null;
    try {
      const { readFile } = await import("node:fs/promises");
      const { join } = await import("node:path");
      return await readFile(join(activeRepoPath, "pipeline.md"), "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return null;
      throw err;
    }
  });
  ipcMain.handle(IPC.PipelineWriteRaw, async (_e, content: string) => {
    if (!activeRepoPath) {
      return { ok: false, reason: "no-active-project" as const };
    }
    if (getCurrent()) {
      return { ok: false, reason: "session-running" as const };
    }
    if (typeof content !== "string") {
      return { ok: false, reason: "content must be a string" };
    }
    try {
      const { writeFile } = await import("node:fs/promises");
      const { join } = await import("node:path");
      await writeFile(join(activeRepoPath, "pipeline.md"), content, "utf8");
      return { ok: true as const };
    } catch (err) {
      return {
        ok: false as const,
        reason: err instanceof Error ? err.message : String(err),
      };
    }
  });
  ipcMain.handle(IPC.ConfigRead, async () => {
    if (!activeRepoPath) return {};
    return readConfig(activeRepoPath);
  });
  ipcMain.handle(IPC.ConfigWrite, async (_e, config: CaffeineConfig) => {
    if (!activeRepoPath) return false;
    await writeConfig(activeRepoPath, config);
    return true;
  });
  ipcMain.handle(IPC.SessionStart, async (_e, args: SessionStartArgs) => {
    if (getCurrent()) {
      return { ok: false, reason: "session-already-running" as const };
    }
    if (!args?.targetRepoPath) {
      return { ok: false, reason: "missing-target-repo" as const };
    }

    // If no resume ID was passed, use the last session for this project.
    const resumeSessionId =
      args.resumeSessionId ?? getLastSessionId(args.targetRepoPath) ?? undefined;

    let sessionId: string | null = null;
    const session = startSession({
      targetRepoPath: args.targetRepoPath,
      model: args.model,
      resumeSessionId,
      costCeilingUsd: args.costCeilingUsd,
      onSessionId: (id) => {
        sessionId = id;
        recordSession(args.targetRepoPath, id);
      },
    });
    setActiveRepoPath(args.targetRepoPath);
    watchState(args.targetRepoPath);
    setCurrent({ project: args.targetRepoPath, session });

    // Clean up the singleton when the loop exits — naturally or via abort.
    session.done.catch(() => {}).finally(() => clearCurrent());

    return { ok: true as const, get sessionId() { return sessionId; } };
  });

  ipcMain.handle(IPC.SessionPause, async () => {
    const cur = getCurrent();
    if (!cur) return false;
    // Interrupt halts the current model turn. The bus stays open; the agent
    // is now waiting for a new user message (intervene) or a stop.
    await cur.session.query.interrupt().catch(() => {});
    emit({ kind: "status", status: "paused", at: Date.now() });
    return true;
  });

  ipcMain.handle(IPC.SessionStop, async () => {
    const cur = getCurrent();
    if (!cur) return false;
    cur.session.bus.close();
    cur.session.abort.abort();
    await cur.session.query.interrupt().catch(() => {});
    clearCurrent();
    return true;
  });

  ipcMain.handle(IPC.SessionIntervene, async (_e, text: string) => {
    const cur = getCurrent();
    if (!cur) return false;
    const trimmed = (text ?? "").trim();
    if (!trimmed) {
      // Empty intervene = "resume" — push a minimal nudge so the bus has a
      // message and the agent re-engages with the protocol.
      cur.session.bus.push("Resume — continue with the protocol.");
    } else {
      cur.session.bus.push(trimmed);
    }
    emit({ kind: "status", status: "running", at: Date.now() });
    return true;
  });
}

export function emitSessionEvent(event: SessionEvent): void {
  const win = getWindow();
  if (!win || win.isDestroyed()) return;
  win.webContents.send(IPC.SessionEvent, event);
}
