import { Fragment, useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import type { AgentSummary, PipelineWireShape } from "@shared/types";
import { SegToggle, StatusBar } from "../components/StatusBar";
import {
  IconBeaker,
  IconCheck,
  IconCpu,
  IconDrag,
  IconEye,
  IconShield,
  IconTerminal,
  IconX,
} from "../components/Icons";

type Mode = "read" | "edit" | "raw";

const STAGE_DRAG_TYPE = "application/x-caffeine-stage";

const STAGE_META: Record<
  string,
  {
    sub: string;
    Icon: (p: { size?: number; stroke?: string }) => React.ReactElement;
  }
> = {
  reviewer: { sub: "adversarial diff critique", Icon: IconEye },
  security: { sub: "secrets · authz · injection", Icon: IconShield },
  tester: { sub: "writes + runs tests", Icon: IconBeaker },
};

const FALLBACK_META = { sub: "stage subagent", Icon: IconCpu };

function stageMeta(name: string) {
  return STAGE_META[name] ?? FALLBACK_META;
}

type StageStatus = "queued" | "active" | "done";

function StageChip({
  name,
  status,
}: {
  name: string;
  status: StageStatus;
}) {
  const meta = stageMeta(name);
  const isActive = status === "active";
  const dotColor =
    status === "active"
      ? "var(--emerald)"
      : status === "done"
        ? "var(--text-3)"
        : "var(--text-4)";

  return (
    <div
      className={isActive ? "stage-glow" : ""}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        padding: "8px 12px",
        border: `1px solid ${isActive ? "var(--emerald)" : "var(--border)"}`,
        background: isActive ? "rgba(16,185,129,0.06)" : "var(--surface)",
        minWidth: 168,
      }}
    >
      <span
        style={{
          width: 26,
          height: 26,
          background: isActive ? "rgba(16,185,129,0.15)" : "var(--bg-2)",
          border: `1px solid ${isActive ? "var(--emerald)" : "var(--border)"}`,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: isActive ? "var(--emerald-300)" : "var(--text-3)",
        }}
      >
        <meta.Icon size={13} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          className="mono"
          style={{
            fontSize: 12,
            color: isActive ? "var(--text)" : "var(--text-2)",
            fontWeight: 600,
          }}
        >
          {name}
        </div>
        <div
          style={{
            fontSize: 10,
            color: "var(--text-4)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {meta.sub}
        </div>
      </div>
      <span
        className={isActive ? "dot-pulse-emerald" : ""}
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: dotColor,
        }}
      />
    </div>
  );
}

function CmdChip({ cmd }: { cmd: string }) {
  return (
    <div
      className="mono"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 11px",
        border: "1px solid var(--border)",
        background: "var(--surface)",
        fontSize: 11.5,
        color: "var(--text-2)",
      }}
    >
      <IconTerminal size={11} stroke="var(--text-4)" />
      <span style={{ color: "var(--text-4)" }}>$</span>
      <span>{cmd}</span>
    </div>
  );
}

function Arrow({
  width = 28,
  color = "var(--text-4)",
}: {
  width?: number;
  color?: string;
}) {
  return (
    <svg width={width} height={14} style={{ flexShrink: 0 }}>
      <line x1="2" y1="7" x2={width - 8} y2="7" stroke={color} strokeWidth="1" />
      <path
        d={`M${width - 8} 3 L${width - 2} 7 L${width - 8} 11`}
        fill="none"
        stroke={color}
        strokeWidth="1"
      />
    </svg>
  );
}

function DownArrow() {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        height: 8,
        marginTop: -10,
        marginBottom: -10,
      }}
    >
      <svg width="14" height="20">
        <line x1="7" y1="0" x2="7" y2="14" stroke="var(--text-4)" />
        <path d="M2 10 L7 16 L12 10" fill="none" stroke="var(--text-4)" />
      </svg>
    </div>
  );
}

function Lane({
  kind,
  count,
  accent,
  headerRight,
  children,
}: {
  kind: string;
  count: string;
  accent: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        background: "rgba(15,15,19,0.5)",
        padding: 14,
        position: "relative",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          marginBottom: 12,
        }}
      >
        <span style={{ width: 3, height: 12, background: accent }} />
        <span
          className="mono"
          style={{
            fontSize: 10.5,
            color: "var(--text-2)",
            textTransform: "uppercase",
            letterSpacing: 1,
            fontWeight: 600,
          }}
        >
          {kind}
        </span>
        <span
          className="mono"
          style={{ fontSize: 10, color: "var(--text-4)" }}
        >
          {count}
        </span>
        {headerRight && <div style={{ marginLeft: "auto" }}>{headerRight}</div>}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 0,
          flexWrap: "wrap",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function ConditionalEdge({
  label,
  color,
  terminal,
  active,
}: {
  label: string;
  color: string;
  terminal: string;
  active?: boolean;
}) {
  const muted = !active;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        opacity: muted ? 0.55 : 1,
      }}
    >
      <svg width="36" height="14" style={{ flexShrink: 0 }}>
        <line
          x1="0"
          y1="7"
          x2="28"
          y2="7"
          stroke={color}
          strokeWidth={active ? 1.4 : 1}
          strokeDasharray={muted ? "3 3" : "0"}
        />
        <path
          d="M28 4 L34 7 L28 10"
          fill="none"
          stroke={color}
          strokeWidth={active ? 1.4 : 1}
        />
      </svg>
      <span
        className="mono"
        style={{
          fontSize: 10,
          color,
          padding: "1px 6px",
          border: `1px solid ${color}`,
          background: muted ? "transparent" : "rgba(251,191,36,0.06)",
        }}
      >
        {label}
      </span>
      <span
        className="mono"
        style={{
          fontSize: 10.5,
          color: muted ? "var(--text-4)" : "var(--text-2)",
        }}
      >
        {terminal}
      </span>
    </div>
  );
}

function FeedbackArc({ active }: { active: boolean }) {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        top: 0,
        right: -8,
        bottom: 0,
        width: 56,
        pointerEvents: "none",
      }}
    >
      <svg
        width="56"
        height="100%"
        viewBox="0 0 56 480"
        preserveAspectRatio="none"
      >
        <defs>
          <marker
            id="arrow-amber"
            viewBox="0 0 10 10"
            refX="6"
            refY="5"
            markerWidth="8"
            markerHeight="8"
            orient="auto"
          >
            <path d="M0 0 L10 5 L0 10 Z" fill="var(--amber)" />
          </marker>
        </defs>
        <path
          d="M 8 420 C 50 420, 50 60, 8 60"
          stroke="var(--amber)"
          strokeWidth={active ? 1.4 : 1}
          strokeDasharray={active ? "0" : "4 4"}
          fill="none"
          className={active ? "" : "arc-flow"}
          markerEnd="url(#arrow-amber)"
          style={
            active
              ? { filter: "drop-shadow(0 0 6px rgba(251,191,36,0.5))" }
              : { opacity: 0.55 }
          }
        />
        <text
          x="42"
          y="240"
          fontSize="10"
          fontFamily="var(--mono)"
          fill="var(--amber)"
          textAnchor="middle"
          transform="rotate(90 42 240)"
          letterSpacing="1.5"
        >
          LOOP
        </text>
      </svg>
    </div>
  );
}

function CanonicalDCG({
  pipeline,
  activeStage,
  iteration,
  decision,
}: {
  pipeline: PipelineWireShape;
  activeStage: string | null;
  iteration: number;
  decision: "done" | "loop" | "halt" | null;
}) {
  return (
    <div
      style={{
        position: "relative",
        padding: "20px 24px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      <Lane
        kind="per_task"
        count={`${pipeline.per_task.length} stages · runs for every backlog item`}
        accent="var(--emerald)"
        headerRight={
          <span
            className="mono"
            style={{ fontSize: 10, color: "var(--text-3)" }}
          >
            for each [task] in BACKLOG.md
          </span>
        }
      >
        {pipeline.per_task.map((name, i) => {
          const status: StageStatus =
            activeStage === name
              ? "active"
              : activeStage &&
                  pipeline.per_task.indexOf(activeStage) > i
                ? "done"
                : "queued";
          return (
            <Fragment key={name + i}>
              <StageChip name={name} status={status} />
              {i < pipeline.per_task.length - 1 && (
                <Arrow
                  color={status === "done" ? "var(--emerald)" : "var(--text-4)"}
                />
              )}
            </Fragment>
          );
        })}
      </Lane>

      <DownArrow />

      <Lane
        kind="on_backlog_complete"
        count={`${pipeline.on_backlog_complete.length} commands · runs once when backlog drains`}
        accent="var(--violet)"
        headerRight={
          <span
            className="mono"
            style={{ fontSize: 10, color: "var(--text-3)" }}
          >
            fast → slow ordering
          </span>
        }
      >
        {pipeline.on_backlog_complete.map((step, i) => (
          <Fragment key={i}>
            <CmdChip cmd={step.run} />
            {i < pipeline.on_backlog_complete.length - 1 && <Arrow />}
          </Fragment>
        ))}
      </Lane>

      <DownArrow />

      <Lane
        kind="decider"
        count={`agentic · iter ${iteration || "—"} / ${pipeline.decider.max_iterations}`}
        accent="var(--amber)"
        headerRight={
          pipeline.decider.cost_ceiling_per_iteration_usd != null && (
            <span
              className="mono"
              style={{ fontSize: 10, color: "var(--text-3)" }}
            >
              cost ceiling ${pipeline.decider.cost_ceiling_per_iteration_usd} /
              iteration
            </span>
          )
        }
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 16px",
            border: "1px solid var(--border-2)",
            background: "var(--surface-2)",
            minWidth: 240,
          }}
        >
          <span
            style={{
              width: 28,
              height: 28,
              background: "rgba(251,191,36,0.1)",
              border: "1px solid rgba(251,191,36,0.4)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--amber)",
            }}
          >
            <IconCpu size={14} />
          </span>
          <div>
            <div
              className="mono"
              style={{
                fontSize: 12,
                color: "var(--text)",
                fontWeight: 600,
              }}
            >
              decider
            </div>
            <div style={{ fontSize: 10, color: "var(--text-4)" }}>
              reads STATE.md + diff + test failures
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            marginLeft: 12,
          }}
        >
          <ConditionalEdge
            label="done"
            color="var(--emerald)"
            terminal="ship"
            active={decision === "done"}
          />
          <ConditionalEdge
            label="loop"
            color="var(--amber)"
            terminal={`append loop_tasks → BACKLOG${iteration > 0 ? ` (iter ${iteration})` : ""}`}
            active={decision === "loop"}
          />
          <ConditionalEdge
            label="halt"
            color="var(--red)"
            terminal="stop · report failure"
            active={decision === "halt"}
          />
        </div>
      </Lane>

      <FeedbackArc active={decision === "loop"} />
    </div>
  );
}

function Palette({
  currentStages,
  agents,
}: {
  currentStages: string[];
  agents: AgentSummary[];
}) {
  const onPaletteDragStart = (name: string) => (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData(
      STAGE_DRAG_TYPE,
      JSON.stringify({ kind: "palette", name }),
    );
  };

  return (
    <div
      style={{
        padding: "10px 24px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-2)",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <span
        className="mono"
        style={{
          fontSize: 10,
          color: "var(--text-4)",
          textTransform: "uppercase",
          letterSpacing: 0.8,
        }}
      >
        agents
      </span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {agents.length === 0 ? (
          <span
            className="mono"
            style={{ fontSize: 10.5, color: "var(--text-4)" }}
          >
            no agents found · drop markdown files in agents/ at the repo root
          </span>
        ) : (
          agents.map((agent) => {
            const used = currentStages.includes(agent.name);
            const meta = stageMeta(agent.name);
            const titleHint = used
              ? "already in pipeline"
              : agent.source === "user"
                ? `${agent.description} · custom (agents/${agent.name}.md)`
                : agent.description;
            return (
              <div
                key={agent.name}
                draggable
                onDragStart={onPaletteDragStart(agent.name)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "5px 10px",
                  border: `1px solid ${agent.source === "user" ? "var(--violet)" : "var(--border)"}`,
                  background: "var(--surface)",
                  cursor: "grab",
                  opacity: used ? 0.4 : 1,
                }}
                title={titleHint}
              >
                <meta.Icon size={11} stroke="var(--text-3)" />
                <span
                  className="mono"
                  style={{ fontSize: 11, color: "var(--text-2)" }}
                >
                  {agent.name}
                </span>
              </div>
            );
          })
        )}
      </div>
      <span
        className="mono"
        style={{
          marginLeft: "auto",
          fontSize: 10.5,
          color: "var(--text-4)",
        }}
      >
        drag into per_task · drop where you want it
      </span>
    </div>
  );
}

function EditableLane({
  stages,
  onChange,
}: {
  stages: string[];
  onChange: (next: string[]) => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const laneRef = useRef<HTMLDivElement | null>(null);

  const onStageDragStart = (i: number) => (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(
      STAGE_DRAG_TYPE,
      JSON.stringify({ kind: "stage", from: i }),
    );
    setDragIndex(i);
  };

  const computeInsertIndex = (clientX: number): number => {
    if (!laneRef.current) return stages.length;
    const chips = laneRef.current.querySelectorAll<HTMLElement>(
      "[data-caffeine-stage]",
    );
    for (let i = 0; i < chips.length; i++) {
      const rect = chips[i].getBoundingClientRect();
      const mid = rect.left + rect.width / 2;
      if (clientX < mid) return i;
    }
    return chips.length;
  };

  const onLaneDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes(STAGE_DRAG_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setInsertAt(computeInsertIndex(e.clientX));
  };

  const onLaneDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData(STAGE_DRAG_TYPE);
    const at = insertAt ?? stages.length;
    setInsertAt(null);
    setDragIndex(null);
    if (!raw) return;
    let payload:
      | { kind: "stage"; from: number }
      | { kind: "palette"; name: string };
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }
    if (payload.kind === "stage") {
      if (payload.from === at || payload.from + 1 === at) return;
      const next = [...stages];
      const [moved] = next.splice(payload.from, 1);
      const adjusted = at > payload.from ? at - 1 : at;
      next.splice(adjusted, 0, moved);
      onChange(next);
    } else if (payload.kind === "palette") {
      if (stages.includes(payload.name)) return;
      const next = [...stages];
      next.splice(at, 0, payload.name);
      onChange(next);
    }
  };

  const onRemove = (i: number) => () => {
    if (stages.length <= 1) return;
    const next = [...stages];
    next.splice(i, 1);
    onChange(next);
  };

  return (
    <div
      ref={laneRef}
      onDragOver={onLaneDragOver}
      onDrop={onLaneDrop}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setInsertAt(null);
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexWrap: "wrap",
        minHeight: 56,
        padding: 4,
        border: "1px dashed var(--border-2)",
      }}
    >
      {stages.map((name, i) => {
        const meta = stageMeta(name);
        const dimmed = dragIndex === i;
        return (
          <Fragment key={name + ":" + i}>
            {insertAt === i && <DropIndicator />}
            <div
              draggable
              data-caffeine-stage="true"
              onDragStart={onStageDragStart(i)}
              onDragEnd={() => {
                setDragIndex(null);
                setInsertAt(null);
              }}
              className="group"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                border: "1px solid var(--border)",
                background: dimmed ? "rgba(255,255,255,0.02)" : "var(--surface)",
                color: dimmed ? "var(--text-4)" : "var(--text-2)",
                cursor: "grab",
              }}
            >
              <span style={{ color: "var(--text-4)" }}>
                <IconDrag size={11} />
              </span>
              <meta.Icon size={11} stroke="var(--text-3)" />
              <span className="mono" style={{ fontSize: 12, fontWeight: 600 }}>
                {name}
              </span>
              {stages.length > 1 && (
                <button
                  type="button"
                  onClick={onRemove(i)}
                  title="Remove stage"
                  style={{
                    marginLeft: 4,
                    color: "var(--text-4)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  <IconX size={10} />
                </button>
              )}
            </div>
          </Fragment>
        );
      })}
      {insertAt === stages.length && <DropIndicator />}
    </div>
  );
}

function DropIndicator() {
  return (
    <div
      aria-hidden
      style={{
        height: 32,
        width: 2,
        borderRadius: 1,
        background: "var(--emerald)",
        boxShadow: "0 0 8px rgba(16,185,129,0.6)",
      }}
    />
  );
}

function PipelineRaw({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        background: "#0a0a0d",
        minHeight: 0,
        overflow: "auto",
      }}
    >
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className="mono"
        style={{
          flex: 1,
          padding: "16px 20px",
          border: "none",
          outline: "none",
          background: "transparent",
          color: "var(--text)",
          fontSize: 12.5,
          lineHeight: 1.6,
          resize: "none",
        }}
        placeholder={`---\nper_task:\n  - reviewer\non_backlog_complete:\n  - run: pnpm test\ndecider:\n  max_iterations: 1\n---\n\n# Pipeline rationale here…`}
      />
    </div>
  );
}

function EmptyPipeline() {
  return (
    <div
      style={{
        flex: 1,
        display: "grid",
        placeItems: "center",
        padding: "0 24px",
        textAlign: "center",
      }}
    >
      <div>
        <div style={{ color: "var(--text-2)", fontSize: 13, marginBottom: 6 }}>
          No pipeline.md in this project.
        </div>
        <div className="mono" style={{ color: "var(--text-4)", fontSize: 11 }}>
          Drop a <span style={{ color: "var(--text-2)" }}>pipeline.md</span> at
          the repo root to enable pipeline mode.
        </div>
      </div>
    </div>
  );
}

export function Pipeline() {
  const live = useStore((s) => s.currentPipeline);
  const status = useStore((s) => s.status);
  const currentStage = useStore((s) => s.currentStage);
  const currentIteration = useStore((s) => s.currentIteration);
  const lastDecision = useStore((s) => s.lastDecision);
  const taskIndex = useStore((s) => s.currentTaskIndex);
  const taskTotal = useStore((s) => s.currentTaskTotal);

  const [diskPipeline, setDiskPipeline] = useState<PipelineWireShape | null>(
    null,
  );
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<Mode>("read");
  const [draft, setDraft] = useState<PipelineWireShape | null>(null);
  const [rawDraft, setRawDraft] = useState<string>("");
  const [rawDirty, setRawDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentSummary[]>([]);

  const sessionRunning = status === "running" || status === "paused";

  useEffect(() => {
    let cancelled = false;
    void window.caffeine.pipeline.read().then((p) => {
      if (cancelled) return;
      setDiskPipeline(p as PipelineWireShape | null);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // The decider isn't a per_task stage — it's the loop-control agent the
  // orchestrator runs separately. Hide it from the drag-and-drop palette
  // so a user can't accidentally place it in per_task.
  const loadAgents = async () => {
    const list = (await window.caffeine.agents.list()) as AgentSummary[];
    setAgents(list.filter((a) => a.name !== "decider"));
  };

  const pipeline = live ?? diskPipeline;

  const enterEdit = () => {
    if (!pipeline) return;
    setDraft({
      per_task: [...pipeline.per_task],
      on_backlog_complete: pipeline.on_backlog_complete.map((s) => ({ ...s })),
      decider: { ...pipeline.decider },
    });
    setMode("edit");
    setSaveError(null);
    void loadAgents();
  };

  const enterRaw = async () => {
    setSaveError(null);
    const raw = (await window.caffeine.pipeline.readRaw()) as string | null;
    setRawDraft(raw ?? "");
    setRawDirty(false);
    setMode("raw");
  };

  const enterRead = () => {
    setDraft(null);
    setRawDraft("");
    setRawDirty(false);
    setMode("read");
    setSaveError(null);
  };

  const saveEdit = async () => {
    if (!draft) return;
    setSaving(true);
    setSaveError(null);
    try {
      const result = (await window.caffeine.pipeline.write(draft)) as
        | { ok: true }
        | { ok: false; reason: string };
      if (!result?.ok) {
        setSaveError(result?.reason ?? "unknown error");
        return;
      }
      setDiskPipeline(draft);
      enterRead();
    } finally {
      setSaving(false);
    }
  };

  const saveRaw = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const result = (await window.caffeine.pipeline.writeRaw(rawDraft)) as
        | { ok: true }
        | { ok: false; reason: string };
      if (!result?.ok) {
        setSaveError(result?.reason ?? "unknown error");
        return;
      }
      const reparsed = (await window.caffeine.pipeline.read()) as
        | PipelineWireShape
        | null;
      setDiskPipeline(reparsed);
      enterRead();
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) {
    return (
      <div
        style={{
          flex: 1,
          display: "grid",
          placeItems: "center",
          fontSize: 12,
          color: "var(--text-3)",
        }}
      >
        Loading pipeline…
      </div>
    );
  }

  const sub =
    pipeline && currentIteration > 0
      ? `iter ${currentIteration}/${pipeline.decider.max_iterations} · task ${taskIndex >= 1 ? taskIndex : "—"}/${taskTotal || "—"}`
      : pipeline
        ? `${pipeline.per_task.length} stages · ${pipeline.on_backlog_complete.length} commands`
        : "no pipeline.md";

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
      <StatusBar
        tabLabel="pipeline.md"
        sub={sub}
        right={
          <>
            <SegToggle
              value={mode}
              onChange={(m) => {
                if (m === "raw") void enterRaw();
                else if (m === "edit") {
                  if (!sessionRunning && pipeline) enterEdit();
                } else enterRead();
              }}
              options={["read", "edit", "raw"]}
            />
          </>
        }
      />
      {saveError && (
        <div
          style={{
            padding: "8px 16px",
            borderBottom: "1px solid rgba(239,68,68,0.4)",
            background: "rgba(239,68,68,0.08)",
            color: "#fca5a5",
            fontSize: 11.5,
            fontFamily: "var(--mono)",
          }}
        >
          save failed: {saveError}
        </div>
      )}
      {mode === "edit" && draft && (
        <Palette currentStages={draft.per_task} agents={agents} />
      )}
      {mode === "raw" ? (
        <PipelineRaw
          value={rawDraft}
          onChange={(v) => {
            setRawDraft(v);
            setRawDirty(true);
          }}
        />
      ) : !pipeline ? (
        <EmptyPipeline />
      ) : mode === "edit" && draft ? (
        <div
          style={{
            flex: 1,
            overflow: "auto",
            padding: "20px 24px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          <Lane
            kind="per_task (editing)"
            count={`${draft.per_task.length} stages · drag to reorder, X to remove`}
            accent="var(--emerald)"
            headerRight={
              <span
                className="mono"
                style={{ fontSize: 10, color: "var(--text-3)" }}
              >
                drop palette items in the lane to add
              </span>
            }
          >
            <EditableLane
              stages={draft.per_task}
              onChange={(stages) =>
                setDraft((d) => (d ? { ...d, per_task: stages } : d))
              }
            />
          </Lane>
          <Lane
            kind="on_backlog_complete"
            count={`${draft.on_backlog_complete.length} commands · raw-mode to edit`}
            accent="var(--violet)"
          >
            {draft.on_backlog_complete.map((step, i) => (
              <Fragment key={i}>
                <CmdChip cmd={step.run} />
                {i < draft.on_backlog_complete.length - 1 && <Arrow />}
              </Fragment>
            ))}
          </Lane>
        </div>
      ) : (
        <div style={{ flex: 1, overflow: "auto" }}>
          <CanonicalDCG
            pipeline={pipeline}
            activeStage={currentStage}
            iteration={currentIteration}
            decision={lastDecision}
          />
        </div>
      )}
      {(mode === "edit" || mode === "raw") && (
        <div
          style={{
            display: "flex",
            gap: 8,
            padding: "10px 16px",
            borderTop: "1px solid var(--border)",
            background: "var(--bg-2)",
          }}
        >
          <button
            type="button"
            onClick={enterRead}
            disabled={saving}
            className="mono"
            style={{
              padding: "5px 12px",
              fontSize: 11.5,
              border: "1px solid var(--border)",
              color: "var(--text-2)",
              opacity: saving ? 0.5 : 1,
            }}
          >
            discard
          </button>
          <button
            type="button"
            onClick={mode === "raw" ? saveRaw : saveEdit}
            disabled={saving || (mode === "raw" && !rawDirty)}
            className="mono"
            style={{
              padding: "5px 12px",
              fontSize: 11.5,
              border: "1px solid var(--emerald)",
              background: "rgba(16,185,129,0.08)",
              color: "var(--emerald-300)",
              opacity: saving || (mode === "raw" && !rawDirty) ? 0.5 : 1,
            }}
          >
            <IconCheck size={10} /> {saving ? "saving…" : "save"}
          </button>
        </div>
      )}
    </div>
  );
}
