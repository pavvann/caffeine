import { useEffect } from "react";
import { useStore } from "../store";

// Renders STATE.md as plain markdown text. We deliberately don't pull in a
// markdown renderer in v1 — the agent's STATE.md is already readable as
// fenced text and any HTML rendering is pure polish. M10 can add remark.

export function StateFile() {
  const stateFile = useStore((s) => s.stateFile);

  // Hydrate once on mount so the view shows current contents even if no
  // change event has fired yet this session.
  useEffect(() => {
    void window.caffeine.state.read().then((content: string) => {
      if (!content) return;
      // Inject through the same ingest path so the watcher and initial
      // read can't fight each other.
      useStore.getState().ingest({ kind: "state-file", content });
    });
  }, []);

  if (!stateFile) {
    return (
      <div className="grid h-full place-items-center text-sm text-zinc-500">
        STATE.md is empty or not yet created. The agent writes it on the first turn.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center border-b border-zinc-800 bg-zinc-900/40 px-3 text-xs text-zinc-500">
        STATE.md — live
      </div>
      <pre className="flex-1 overflow-auto whitespace-pre-wrap p-4 font-mono text-sm leading-6 text-zinc-200">
        {stateFile}
      </pre>
    </div>
  );
}
