import { useEffect } from "react";
import { useStore } from "./store";
import { Sidebar } from "./components/Sidebar";
import { WindowHeader } from "./components/WindowHeader";
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
      <WindowHeader />
      <div className="flex flex-1 min-h-0">
        {project ? (
          <>
            <Sidebar />
            <main className="flex-1 min-w-0 flex flex-col">
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
