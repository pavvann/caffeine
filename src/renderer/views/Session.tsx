import { useEffect, useRef, useState } from "react";
import { useStore, type TranscriptRow } from "../store";
import {
  IconArrowRight,
  IconBolt,
  IconClock,
  IconCpu,
  IconDollar,
  IconEdit,
  IconEye,
  IconPause,
  IconPlay,
  IconSend,
  IconStop,
  IconTerminal,
} from "../components/Icons";
import type { SessionStatus } from "@shared/types";

type ToolMeta = {
  color: string;
  bg: string;
  emphasis: "low" | "high";
  Icon: (p: {
    size?: number;
    stroke?: string;
    fill?: string;
  }) => React.ReactElement;
};

const TOOL_META: Record<string, ToolMeta> = {
  Read: { color: "#a1a1aa", bg: "rgba(161,161,170,0.06)", emphasis: "low", Icon: IconEye },
  Edit: { color: "#6ee7b7", bg: "rgba(16,185,129,0.08)", emphasis: "high", Icon: IconEdit },
  Write: { color: "#6ee7b7", bg: "rgba(16,185,129,0.08)", emphasis: "high", Icon: IconEdit },
  Bash: { color: "#fbbf24", bg: "rgba(251,191,36,0.07)", emphasis: "high", Icon: IconTerminal },
  Grep: { color: "#a1a1aa", bg: "rgba(161,161,170,0.06)", emphasis: "low", Icon: IconEye },
  Glob: { color: "#a1a1aa", bg: "rgba(161,161,170,0.06)", emphasis: "low", Icon: IconEye },
  Agent: { color: "#c4b5fd", bg: "rgba(139,92,246,0.08)", emphasis: "high", Icon: IconCpu },
};

const DEFAULT_TOOL_META: ToolMeta = TOOL_META.Read;

function formatTimestamp(at: number): string {
  return new Date(at).toLocaleTimeString("en-GB", { hour12: false });
}

function summarizeInput(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const obj = input as Record<string, unknown>;
  for (const key of ["command", "file_path", "path", "pattern", "description"]) {
    const v = obj[key];
    if (typeof v === "string") return v.length > 80 ? `${v.slice(0, 80)}…` : v;
  }
  const json = JSON.stringify(obj);
  return json.length > 80 ? `${json.slice(0, 80)}…` : json;
}

function StatusDot({ status }: { status: "pending" | "done" | "error" }) {
  if (status === "pending") {
    return (
      <span
        className="dot-pulse-amber"
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "var(--amber)",
          display: "inline-block",
        }}
      />
    );
  }
  if (status === "error") {
    return (
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "var(--red)",
          display: "inline-block",
        }}
      />
    );
  }
  return (
    <span
      style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: "var(--emerald)",
        display: "inline-block",
      }}
    />
  );
}

function ToolRow({ row }: { row: Extract<TranscriptRow, { kind: "tool" }> }) {
  const meta = TOOL_META[row.name] ?? DEFAULT_TOOL_META;
  const isHigh = meta.emphasis === "high";

  return (
    <div
      className="tick-in"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: isHigh ? "6px 14px 6px 10px" : "3px 14px 3px 10px",
        borderLeft: isHigh ? `2px solid ${meta.color}` : "2px solid transparent",
        background: isHigh ? meta.bg : "transparent",
        marginLeft: 2,
      }}
    >
      <span
        className="mono"
        style={{
          fontSize: 10,
          color: "var(--text-4)",
          width: 56,
          paddingTop: 2,
        }}
      >
        {formatTimestamp(row.startedAt)}
      </span>
      <span style={{ paddingTop: 4 }}>
        <StatusDot status={row.status} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              color: meta.color,
            }}
          >
            <meta.Icon size={11} />
            <span className="mono" style={{ fontSize: 11, fontWeight: 600 }}>
              {row.name}
            </span>
          </span>
          <span
            className="mono"
            style={{
              fontSize: 11.5,
              color: "var(--text)",
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {summarizeInput(row.input)}
          </span>
        </div>
      </div>
    </div>
  );
}

function AssistantTextRow({
  row,
}: {
  row: Extract<TranscriptRow, { kind: "text" }>;
}) {
  return (
    <div
      className="tick-in"
      style={{
        display: "flex",
        gap: 10,
        padding: "8px 14px 8px 10px",
      }}
    >
      <span
        className="mono"
        style={{
          fontSize: 10,
          color: "var(--text-4)",
          width: 56,
          paddingTop: 2,
        }}
      >
        {formatTimestamp(row.at)}
      </span>
      <span style={{ paddingTop: 6 }}>
        <span
          style={{
            width: 6,
            height: 6,
            background: "var(--emerald)",
            display: "inline-block",
            transform: "rotate(45deg)",
          }}
        />
      </span>
      <div
        style={{
          fontSize: 12.5,
          color: "var(--text)",
          lineHeight: 1.55,
          paddingTop: 1,
          maxWidth: 720,
          whiteSpace: "pre-wrap",
        }}
      >
        {row.text}
      </div>
    </div>
  );
}

function StatusHeaderBar({
  status,
  taskIndex,
  taskTotal,
  currentStage,
  iteration,
  cost,
  tokens,
  model,
}: {
  status: SessionStatus;
  taskIndex: number;
  taskTotal: number;
  currentStage: string | null;
  iteration: number;
  cost: number;
  tokens: number;
  model: string;
}) {
  const isRunning = status === "running";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "10px 16px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-2)",
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span
          className={isRunning ? "dot-pulse-emerald" : ""}
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background:
              status === "running"
                ? "var(--emerald)"
                : status === "paused"
                  ? "var(--amber)"
                  : status === "error"
                    ? "var(--red)"
                    : "var(--text-4)",
          }}
        />
        <span
          className="mono"
          style={{
            fontSize: 11.5,
            color: isRunning ? "var(--emerald-300)" : "var(--text-3)",
            textTransform: "uppercase",
            letterSpacing: 0.8,
            fontWeight: 600,
          }}
        >
          {status}
        </span>
      </div>

      <Divider />

      {(taskTotal > 0 || currentStage || iteration > 0) && (
        <>
          <div
            className="mono"
            style={{
              fontSize: 11.5,
              color: "var(--text-2)",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {taskTotal > 0 && (
              <>
                <span style={{ color: "var(--text-3)" }}>task</span>
                <span style={{ color: "var(--text)" }}>
                  {taskIndex}/{taskTotal}
                </span>
              </>
            )}
            {currentStage && (
              <>
                <IconArrowRight size={9} stroke="var(--text-4)" />
                <span style={{ color: "var(--amber)" }}>{currentStage}</span>
              </>
            )}
            {iteration > 0 && (
              <>
                <IconArrowRight size={9} stroke="var(--text-4)" />
                <span style={{ color: "var(--text-3)" }}>iter</span>
                <span style={{ color: "var(--text)" }}>{iteration}</span>
              </>
            )}
          </div>
          <Divider />
        </>
      )}

      <div
        className="mono"
        style={{
          fontSize: 11.5,
          color: "var(--text-2)",
          display: "flex",
          alignItems: "center",
          gap: 5,
        }}
      >
        <IconCpu size={11} stroke="var(--text-4)" />
        {tokens.toLocaleString()}{" "}
        <span style={{ color: "var(--text-4)" }}>tok</span>
      </div>

      <div
        className="mono"
        style={{
          fontSize: 11.5,
          color: "var(--text-2)",
          display: "flex",
          alignItems: "center",
          gap: 5,
        }}
      >
        <IconDollar size={11} stroke="var(--text-4)" />
        {cost.toFixed(4)}
      </div>

      <div style={{ marginLeft: "auto" }}>
        <span
          className="mono"
          style={{
            fontSize: 10.5,
            color: "var(--text-4)",
            textTransform: "uppercase",
            letterSpacing: 0.8,
          }}
        >
          {model}
        </span>
      </div>
    </div>
  );
}

function Divider() {
  return (
    <span style={{ width: 1, height: 14, background: "var(--border)" }} />
  );
}

function ControlBar({
  status,
  busy,
  intervene,
  setIntervene,
  onStart,
  onPause,
  onResume,
  onStop,
  onSend,
}: {
  status: SessionStatus;
  busy: boolean;
  intervene: string;
  setIntervene: (v: string) => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onSend: () => void;
}) {
  const isRunning = status === "running";
  const isPaused = status === "paused";

  return (
    <div
      style={{
        borderTop: "1px solid var(--border)",
        background: "var(--bg-2)",
        padding: "10px 14px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {!isRunning && !isPaused && (
          <button
            type="button"
            disabled={busy}
            onClick={onStart}
            className="mono"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 11px",
              fontSize: 11.5,
              border: "1px solid var(--emerald)",
              background: "rgba(16,185,129,0.08)",
              color: "var(--emerald-300)",
              opacity: busy ? 0.5 : 1,
            }}
          >
            <IconPlay size={11} /> start
          </button>
        )}
        {isRunning && (
          <button
            type="button"
            disabled={busy}
            onClick={onPause}
            className="mono"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 11px",
              fontSize: 11.5,
              border: "1px solid var(--border)",
              color: "var(--text-2)",
              opacity: busy ? 0.5 : 1,
            }}
          >
            <IconPause size={11} /> pause
          </button>
        )}
        {isPaused && (
          <button
            type="button"
            disabled={busy}
            onClick={onResume}
            className="mono"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 11px",
              fontSize: 11.5,
              border: "1px solid var(--emerald)",
              color: "var(--emerald-300)",
              opacity: busy ? 0.5 : 1,
            }}
          >
            <IconPlay size={11} /> resume
          </button>
        )}
        {(isRunning || isPaused) && (
          <button
            type="button"
            disabled={busy}
            onClick={onStop}
            className="mono"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 11px",
              fontSize: 11.5,
              border: "1px solid rgba(239,68,68,0.3)",
              color: "#fca5a5",
              opacity: busy ? 0.5 : 1,
            }}
          >
            <IconStop size={11} /> stop
          </button>
        )}
        <span
          className="mono"
          style={{
            marginLeft: "auto",
            fontSize: 10.5,
            color: "var(--text-4)",
          }}
        >
          ⌘K to focus · ⌘. to halt
        </span>
      </div>

      <div
        style={{
          border: "1px solid var(--border)",
          background: "#0a0a0d",
          position: "relative",
          boxShadow: "inset 0 0 0 1px rgba(16,185,129,0.06)",
        }}
      >
        <div
          style={{
            padding: "4px 10px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            gap: 7,
            background: "rgba(16,185,129,0.04)",
          }}
        >
          <IconBolt
            size={10}
            stroke="var(--emerald-300)"
            fill="var(--emerald-300)"
          />
          <span
            className="mono"
            style={{
              fontSize: 10,
              color: "var(--emerald-300)",
              textTransform: "uppercase",
              letterSpacing: 0.8,
              fontWeight: 600,
            }}
          >
            intervene
          </span>
          <span style={{ fontSize: 10.5, color: "var(--text-4)" }}>
            push a message into the bus mid-session
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "stretch" }}>
          <span
            className="mono"
            style={{
              padding: "8px 4px 8px 10px",
              color: "var(--emerald)",
              fontSize: 12,
            }}
          >
            ›
          </span>
          <input
            value={intervene}
            onChange={(e) => setIntervene(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSend();
            }}
            placeholder="also rename the error class to AuthExpiredError before moving on"
            className="mono"
            style={{
              flex: 1,
              padding: "8px 4px",
              border: "none",
              outline: "none",
              background: "transparent",
              color: "var(--text)",
              fontSize: 12,
            }}
          />
          <button
            type="button"
            onClick={onSend}
            className="mono"
            style={{
              padding: "6px 10px",
              borderLeft: "1px solid var(--border)",
              fontSize: 11,
              color: "var(--emerald-300)",
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            send <IconSend size={10} />
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  status,
  reason,
}: {
  status: SessionStatus;
  reason: string | null;
}) {
  if (status === "error") {
    return (
      <div
        style={{
          display: "grid",
          height: "100%",
          placeItems: "center",
          padding: "0 24px",
        }}
      >
        <div
          style={{
            maxWidth: 480,
            border: "1px solid rgba(239,68,68,0.3)",
            background: "rgba(239,68,68,0.05)",
            padding: "16px 18px",
          }}
        >
          <div
            className="mono"
            style={{
              fontSize: 11,
              color: "#fca5a5",
              textTransform: "uppercase",
              letterSpacing: 0.8,
              fontWeight: 600,
              marginBottom: 6,
            }}
          >
            session failed to start
          </div>
          <div
            className="mono"
            style={{
              fontSize: 12,
              color: "var(--text-2)",
              wordBreak: "break-word",
            }}
          >
            {reason}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--text-4)",
              marginTop: 12,
              lineHeight: 1.5,
            }}
          >
            Common fix: open a terminal and run{" "}
            <span className="mono" style={{ color: "var(--text-2)" }}>
              claude
            </span>{" "}
            once to confirm you’re signed in. Open DevTools (Cmd+Opt+I) for the
            full trace.
          </div>
        </div>
      </div>
    );
  }
  return (
    <div
      style={{
        display: "grid",
        height: "100%",
        placeItems: "center",
        color: "var(--text-3)",
        fontSize: 13,
      }}
    >
      {status === "idle"
        ? "No session running. Click Start below."
        : "Waiting for first message…"}
    </div>
  );
}

export function Session() {
  const rows = useStore((s) => s.rows);
  const status = useStore((s) => s.status);
  const statusReason = useStore((s) => s.statusReason);
  const cost = useStore((s) => s.cost);
  const currentStage = useStore((s) => s.currentStage);
  const currentIteration = useStore((s) => s.currentIteration);
  const currentTaskIndex = useStore((s) => s.currentTaskIndex);
  const currentTaskTotal = useStore((s) => s.currentTaskTotal);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [intervene, setIntervene] = useState("");

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (dist < 200) el.scrollTop = el.scrollHeight;
  }, [rows]);

  const start = async () => {
    setBusy(true);
    try {
      const project = useStore.getState().project;
      const targetRepoPath = project?.path ?? "";
      const config = (await window.caffeine.config.read()) as {
        model?: string;
        costCeilingUsd?: number;
      };
      const r = (await window.caffeine.session.start({
        targetRepoPath,
        model: config?.model,
        costCeilingUsd: config?.costCeilingUsd,
      })) as { ok: boolean; reason?: string } | null;
      if (!r?.ok) {
        useStore.getState().ingest({
          kind: "status",
          status: "error",
          reason: `Could not start: ${r?.reason ?? "unknown"}`,
          at: Date.now(),
        });
      }
    } catch (err) {
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

  const resume = async () => {
    setBusy(true);
    try {
      await window.caffeine.session.intervene("");
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

  const send = async () => {
    if (!intervene.trim()) return;
    await window.caffeine.session.intervene(intervene);
    setIntervene("");
  };

  // Approximate token total from the running cost counter — we don't track
  // tokens separately in the store, but cost events carry both.
  const tokens = cost.inputTokens + cost.outputTokens;

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        background: "var(--bg)",
        minHeight: 0,
      }}
    >
      <StatusHeaderBar
        status={status}
        taskIndex={currentTaskIndex >= 1 ? currentTaskIndex : 0}
        taskTotal={currentTaskTotal}
        currentStage={currentStage}
        iteration={currentIteration}
        cost={cost.costUsd}
        tokens={tokens}
        model="opus 4.7"
      />
      <div
        ref={scrollRef}
        style={{ flex: 1, overflow: "auto", padding: "6px 0 16px" }}
      >
        {rows.length === 0 ? (
          <EmptyState status={status} reason={statusReason} />
        ) : (
          rows.map((row) =>
            row.kind === "tool" ? (
              <ToolRow key={row.id} row={row} />
            ) : (
              <AssistantTextRow key={row.id} row={row} />
            ),
          )
        )}
      </div>
      <ControlBar
        status={status}
        busy={busy}
        intervene={intervene}
        setIntervene={setIntervene}
        onStart={start}
        onPause={pause}
        onResume={resume}
        onStop={stop}
        onSend={send}
      />
    </div>
  );
}
