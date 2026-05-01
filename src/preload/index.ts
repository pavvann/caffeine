import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import { IPC, type SessionEvent } from "@shared/types";

const api = {
  project: {
    list: () => ipcRenderer.invoke(IPC.ProjectList),
    open: (path: string) => ipcRenderer.invoke(IPC.ProjectOpen, path),
  },
  backlog: {
    read: () => ipcRenderer.invoke(IPC.BacklogRead),
    write: (content: string) => ipcRenderer.invoke(IPC.BacklogWrite, content),
  },
  state: {
    read: () => ipcRenderer.invoke(IPC.StateRead),
  },
  pipeline: {
    read: () => ipcRenderer.invoke(IPC.PipelineRead),
    write: (pipeline: unknown) =>
      ipcRenderer.invoke(IPC.PipelineWrite, pipeline),
  },
  config: {
    read: () => ipcRenderer.invoke(IPC.ConfigRead),
    write: (cfg: unknown) => ipcRenderer.invoke(IPC.ConfigWrite, cfg),
  },
  session: {
    start: (args: {
      targetRepoPath: string;
      model?: string;
      resumeSessionId?: string;
      costCeilingUsd?: number;
    }) => ipcRenderer.invoke(IPC.SessionStart, args),
    pause: () => ipcRenderer.invoke(IPC.SessionPause),
    stop: () => ipcRenderer.invoke(IPC.SessionStop),
    intervene: (text: string) => ipcRenderer.invoke(IPC.SessionIntervene, text),
    onEvent: (cb: (e: SessionEvent) => void): (() => void) => {
      const listener = (_: IpcRendererEvent, event: SessionEvent) => cb(event);
      ipcRenderer.on(IPC.SessionEvent, listener);
      return () => {
        ipcRenderer.removeListener(IPC.SessionEvent, listener);
      };
    },
  },
};

contextBridge.exposeInMainWorld("caffeine", api);

export type CaffeineApi = typeof api;
