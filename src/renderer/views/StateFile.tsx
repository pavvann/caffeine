// STATE.md viewer. The agent owns this file (writes lessons, decisions,
// open questions, current task, etc.) so this view is intentionally
// read-only — there's no "edit" mode here. Two display modes:
//
//   Read — react-markdown renders headings, lists, code blocks
//   Raw  — plain text in a monospace pre, what's literally on disk
//
// The store's `stateFile` is fed by chokidar in the main process, so
// either mode auto-updates when the agent writes new findings.

import { useEffect, useState } from "react";
import { useStore } from "../store";
import { MarkdownView } from "../components/MarkdownView";
import { SegmentedToggle } from "../components/SegmentedToggle";

type Mode = "read" | "raw";

export function StateFile() {
  const stateFile = useStore((s) => s.stateFile);
  const [mode, setMode] = useState<Mode>("read");

  // Initial fetch — on first mount the chokidar watcher hasn't fired
  // yet, so seed the store directly from disk.
  useEffect(() => {
    void window.caffeine.state.read().then((content: string) => {
      if (!content) return;
      useStore.getState().ingest({ kind: "state-file", content });
    });
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center gap-3 border-b border-zinc-800 bg-zinc-900/40 px-3 text-xs text-zinc-500">
        <span className="font-mono text-zinc-400">STATE.md</span>
        <span className="text-zinc-600">— live (agent-written)</span>
        <div className="ml-auto">
          <SegmentedToggle
            value={mode}
            onChange={setMode}
            options={[
              { id: "read", label: "Read" },
              { id: "raw", label: "Raw" },
            ]}
          />
        </div>
      </div>
      {!stateFile ? (
        <div className="grid h-full place-items-center text-sm text-zinc-500">
          STATE.md is empty or not yet created. The agent writes it on the
          first turn.
        </div>
      ) : mode === "read" ? (
        <MarkdownView content={stateFile} />
      ) : (
        <pre className="flex-1 overflow-auto whitespace-pre-wrap p-6 font-mono text-sm leading-6 text-zinc-200">
          {stateFile}
        </pre>
      )}
    </div>
  );
}
