import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { TranscriptRow } from "../components/TranscriptRow";
import { StatusBar } from "../components/StatusBar";

export function Session() {
  const rows = useStore((s) => s.rows);
  const status = useStore((s) => s.status);
  const statusReason = useStore((s) => s.statusReason);
  const scrollRef = useRef<HTMLDivElement>(null);

  // auto-scroll to bottom when new rows arrive, but only if the user
  // is already near the bottom (don't yank them away from history)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distFromBottom < 200) {
      el.scrollTop = el.scrollHeight;
    }
  }, [rows]);

  return (
    <div className="flex h-full flex-col">
      <StatusBar />
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <EmptyState status={status} reason={statusReason} />
        ) : (
          rows.map((row) => <TranscriptRow key={`${row.kind}-${row.id}`} row={row} />)
        )}
      </div>
      <SessionControls />
    </div>
  );
}

function EmptyState({ status, reason }: { status: string; reason: string | null }) {
  if (status === "error") {
    return (
      <div className="grid h-full place-items-center px-6">
        <div className="max-w-lg space-y-2 rounded border border-red-900/60 bg-red-950/30 p-4 text-sm">
          <div className="font-medium text-red-300">Session failed to start</div>
          <div className="font-mono text-xs text-red-200 break-words">{reason}</div>
          <div className="pt-2 text-xs text-zinc-400">
            Common fixes: open Terminal and run <span className="font-mono text-zinc-200">claude</span> to confirm you&apos;re signed in. Open DevTools (Cmd+Opt+I) for the full trace.
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="grid h-full place-items-center text-sm text-zinc-500">
      {status === "idle"
        ? "No session running. Click Start below."
        : "Waiting for first message…"}
    </div>
  );
}

function SessionControls() {
  const status = useStore((s) => s.status);
  const reset = useStore((s) => s.reset);
  const [busy, setBusy] = useState(false);
  const [intervene, setIntervene] = useState("");

  const start = async () => {
    setBusy(true);
    try {
      const project = useStore.getState().project;
      const targetRepoPath = project?.path ?? "";
      const config = (await window.caffeine.config.read()) as {
        model?: string;
        costCeilingUsd?: number;
      };
      // eslint-disable-next-line no-console
      console.log("[caffeine] starting session", { targetRepoPath, model: config?.model });
      const r = (await window.caffeine.session.start({
        targetRepoPath,
        model: config?.model,
        costCeilingUsd: config?.costCeilingUsd,
      })) as { ok: boolean; reason?: string } | null;
      // eslint-disable-next-line no-console
      console.log("[caffeine] session.start returned", r);
      if (!r?.ok) {
        useStore.getState().ingest({
          kind: "status",
          status: "error",
          reason: `Could not start: ${r?.reason ?? "unknown"}`,
          at: Date.now(),
        });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[caffeine] start threw", err);
      useStore.getState().ingest({
        kind: "status",
        status: "error",
        reason: err instanceof Error ? err.message : String(err),
        at: Date.now(),
      });
    } finally {
      setBusy(false);
    }
  };

  const pause = async () => {
    setBusy(true);
    try {
      await window.caffeine.session.pause();
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    try {
      await window.caffeine.session.stop();
    } finally {
      setBusy(false);
    }
  };

  const sendIntervene = async () => {
    if (!intervene.trim()) return;
    await window.caffeine.session.intervene(intervene);
    setIntervene("");
  };

  const running = status === "running";
  const paused = status === "paused";

  const resume = async () => {
    setBusy(true);
    try {
      await window.caffeine.session.intervene("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="shrink-0 border-t border-zinc-800 bg-zinc-900/40 p-3">
      <div className="flex items-center gap-2">
        {running && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={pause}
              className="rounded bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-50"
            >
              Pause
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={stop}
              className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50"
            >
              Stop
            </button>
          </>
        )}
        {paused && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={resume}
              className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              Resume
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={stop}
              className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50"
            >
              Stop
            </button>
          </>
        )}
        {!running && !paused && (
          <button
            type="button"
            disabled={busy}
            onClick={start}
            className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            Start
          </button>
        )}
        <button
          type="button"
          onClick={reset}
          className="rounded border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          Clear transcript
        </button>
      </div>
      <div className="mt-2 flex gap-2">
        <input
          type="text"
          value={intervene}
          onChange={(e) => setIntervene(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") sendIntervene();
          }}
          placeholder="Intervene — type a message and press Enter"
          className="flex-1 rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
        />
        <button
          type="button"
          onClick={sendIntervene}
          className="rounded border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          Send
        </button>
      </div>
    </div>
  );
}
