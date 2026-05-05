import { useEffect } from "react";
import { useStore } from "./store";
import { Sidebar } from "./components/Sidebar";
import { Session } from "./views/Session";
import { Backlog } from "./views/Backlog";
import { Pipeline } from "./views/Pipeline";
import { StateFile } from "./views/StateFile";
import { ProjectPicker } from "./views/ProjectPicker";
import { Settings } from "./views/Settings";
import type { SessionEvent } from "@shared/types";

export function App() {
  const view = useStore((s) => s.view);
  const project = useStore((s) => s.project);
  const setProject = useStore((s) => s.setProject);
  const ingest = useStore((s) => s.ingest);
  const hydrateHistory = useStore((s) => s.hydrateHistory);

  useEffect(() => {
    return window.caffeine.session.onEvent(ingest);
  }, [ingest]);

  // Hydrate the transcript from disk whenever a project becomes
  // active. The IPC handler returns events for the project's most
  // recent session, ordered by insertion. hydrateHistory() filters
  // status/subagent-state events and resets transcript-derived
  // fields before replaying so switching projects doesn't accumulate.
  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    void window.caffeine.session.history().then((events) => {
      if (cancelled) return;
      hydrateHistory((events as SessionEvent[]) ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [project?.id, hydrateHistory]);

  return (
    <div className="flex h-screen flex-col">
      <header className="h-10 shrink-0 border-b border-zinc-800 bg-zinc-900/60 backdrop-blur flex items-center pl-[88px] pr-4 [-webkit-app-region:drag]">
        <div className="text-sm font-medium tracking-tight text-zinc-300">
          Caffeine
        </div>
        <div className="ml-3 text-xs text-zinc-500">
          {project ? project.name : "long-running Claude sessions, controlled"}
        </div>
        {project && (
          <button
            type="button"
            onClick={() => setProject(null)}
            className="ml-auto text-[11px] text-zinc-500 hover:text-zinc-300 [-webkit-app-region:no-drag]"
          >
            Switch project
          </button>
        )}
      </header>
      <div className="flex flex-1 min-h-0">
        {project ? (
          <>
            <Sidebar />
            <main className="flex-1 min-w-0">
              {view === "session" && <Session />}
              {view === "backlog" && <Backlog />}
              {view === "pipeline" && <Pipeline />}
              {view === "state" && <StateFile />}
              {view === "settings" && <Settings />}
            </main>
          </>
        ) : (
          <main className="flex-1 min-w-0">
            <ProjectPicker onOpened={setProject} />
          </main>
        )}
      </div>
    </div>
  );
}
