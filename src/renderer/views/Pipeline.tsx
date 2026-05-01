// Pipeline view — visual rendering of the DCG (Directed Cyclic Graph
// with conditional edges) the user dropped at the repo root.
//
// Three lanes top-to-bottom: per_task stages, on_backlog_complete
// commands, decider with conditional outputs. The cyclic edge from
// the decider back to per_task is the thing that makes this a DCG and
// not a DAG; we draw it as an explicit labeled SVG arc on the right
// side of the graph so the user can see the loop is real, not implied.
//
// When a session is running, `currentPipeline` from the store takes
// precedence — that's the pipeline the runner actually loaded. When
// idle, we fetch pipeline.md via the IPC read so the view is useful
// even before clicking Start.
//
// Edit mode (v0.0.4): per_task stages are drag-and-drop reorderable,
// removable via the ✕ on each node, and addable from the palette
// strip at the top. Save writes back to pipeline.md preserving the
// markdown body. Edit is disabled while a session is running.

import { Fragment, useEffect, useState } from "react";
import { useStore } from "../store";
import type { PipelineWireShape } from "@shared/types";

const AVAILABLE_AGENTS: { name: string; blurb: string }[] = [
  {
    name: "reviewer",
    blurb: "adversarial diff critique",
  },
  {
    name: "security",
    blurb: "secrets, injection, missing authz",
  },
  {
    name: "tester",
    blurb: "writes tests for the changed code",
  },
];

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
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<PipelineWireShape | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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

  // Live overrides disk while a session is running.
  const pipeline = live ?? diskPipeline;

  const startEdit = () => {
    if (!pipeline) return;
    // Deep-clone so reorder/add/remove don't mutate the source.
    setDraft({
      per_task: [...pipeline.per_task],
      on_backlog_complete: pipeline.on_backlog_complete.map((s) => ({ ...s })),
      decider: { ...pipeline.decider },
    });
    setEditing(true);
    setSaveError(null);
  };

  const discardEdit = () => {
    setDraft(null);
    setEditing(false);
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
      setDraft(null);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) {
    return (
      <div className="grid h-full place-items-center text-sm text-zinc-500">
        Loading pipeline…
      </div>
    );
  }

  if (!pipeline) {
    return <EmptyState />;
  }

  // Source of truth for what the graph renders.
  const display = editing && draft ? draft : pipeline;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <Header
        pipeline={display}
        iteration={currentIteration}
        taskIndex={taskIndex}
        taskTotal={taskTotal}
        editing={editing}
        sessionRunning={sessionRunning}
        saving={saving}
        onEdit={startEdit}
        onSave={saveEdit}
        onDiscard={discardEdit}
      />
      {saveError && (
        <div className="border-b border-red-900/60 bg-red-950/30 px-4 py-2 text-xs text-red-300">
          Save failed: <span className="font-mono">{saveError}</span>
        </div>
      )}
      {editing && draft && (
        <Palette currentStages={draft.per_task} />
      )}
      <div className="flex-1 px-8 py-6">
        <Graph
          pipeline={display}
          activeStage={editing ? null : currentStage}
          iteration={editing ? 0 : currentIteration}
          decision={editing ? null : lastDecision}
          editing={editing}
          onPerTaskChange={(stages) =>
            setDraft((d) => (d ? { ...d, per_task: stages } : d))
          }
        />
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="grid h-full place-items-center px-6 text-center text-sm text-zinc-500">
      <div>
        <div className="mb-2 text-zinc-400">No pipeline.md in this project.</div>
        <div className="font-mono text-xs text-zinc-600">
          Drop a <span className="text-zinc-300">pipeline.md</span> at the repo
          root to enable pipeline mode.
        </div>
        <div className="mt-3 text-[11px] text-zinc-600">
          See <span className="font-mono">CHANGELOG.md</span> for the YAML
          frontmatter format.
        </div>
      </div>
    </div>
  );
}

function Header({
  pipeline,
  iteration,
  taskIndex,
  taskTotal,
  editing,
  sessionRunning,
  saving,
  onEdit,
  onSave,
  onDiscard,
}: {
  pipeline: PipelineWireShape;
  iteration: number;
  taskIndex: number;
  taskTotal: number;
  editing: boolean;
  sessionRunning: boolean;
  saving: boolean;
  onEdit: () => void;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const max = pipeline.decider.max_iterations;
  const iterDisplay = iteration > 0 ? `${iteration} / ${max}` : `— / ${max}`;
  const taskDisplay =
    taskIndex >= 1 && taskTotal >= 1 ? `${taskIndex} / ${taskTotal}` : null;

  return (
    <div className="flex h-9 shrink-0 items-center gap-4 border-b border-zinc-800 bg-zinc-900/40 px-4 text-xs text-zinc-400">
      <span className="font-mono text-zinc-300">pipeline.md</span>
      {!editing && (
        <>
          <span>·</span>
          <span>
            Iteration{" "}
            <span className="font-mono text-zinc-200">{iterDisplay}</span>
          </span>
          {taskDisplay && (
            <>
              <span>·</span>
              <span>
                Task{" "}
                <span className="font-mono text-zinc-200">{taskDisplay}</span>
              </span>
            </>
          )}
        </>
      )}
      {editing && (
        <span className="font-mono text-amber-300">editing</span>
      )}
      <div className="ml-auto flex items-center gap-2">
        {!editing && (
          <button
            type="button"
            onClick={onEdit}
            disabled={sessionRunning}
            title={
              sessionRunning
                ? "Stop the session to edit the pipeline"
                : "Edit per_task stages"
            }
            className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Edit
          </button>
        )}
        {editing && (
          <>
            <button
              type="button"
              onClick={onDiscard}
              disabled={saving}
              className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="rounded bg-emerald-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Palette (visible only in edit mode)
// ---------------------------------------------------------------------------

function Palette({ currentStages }: { currentStages: string[] }) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-zinc-800 bg-zinc-950/80 px-4 py-2 text-[11px] text-zinc-500">
      <span className="font-mono text-zinc-400">Available agents</span>
      <span className="text-zinc-600">— drag into the per_task lane</span>
      <div className="flex items-center gap-2">
        {AVAILABLE_AGENTS.map((agent) => {
          const alreadyUsed = currentStages.includes(agent.name);
          return (
            <PaletteItem
              key={agent.name}
              name={agent.name}
              blurb={agent.blurb}
              dimmed={alreadyUsed}
            />
          );
        })}
      </div>
    </div>
  );
}

function PaletteItem({
  name,
  blurb,
  dimmed,
}: {
  name: string;
  blurb: string;
  dimmed: boolean;
}) {
  const onDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData(
      "application/x-caffeine-stage",
      JSON.stringify({ kind: "palette", name }),
    );
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      title={blurb}
      className={`cursor-grab rounded border px-2 py-0.5 text-xs transition ${
        dimmed
          ? "border-zinc-800 bg-zinc-900/40 text-zinc-600"
          : "border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-emerald-700 hover:text-emerald-200"
      }`}
    >
      {name}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Graph
// ---------------------------------------------------------------------------

type Decision = "done" | "loop" | "halt" | null;

function Graph({
  pipeline,
  activeStage,
  iteration,
  decision,
  editing,
  onPerTaskChange,
}: {
  pipeline: PipelineWireShape;
  activeStage: string | null;
  iteration: number;
  decision: Decision;
  editing: boolean;
  onPerTaskChange: (stages: string[]) => void;
}) {
  const running = iteration > 0;

  return (
    <div className="relative mx-auto max-w-3xl">
      <Lane
        title="per_task"
        subtitle="runs for each unchecked BACKLOG.md item"
      >
        {editing ? (
          <PerTaskLaneEditable
            stages={pipeline.per_task}
            onChange={onPerTaskChange}
          />
        ) : (
          <PerTaskLaneReadOnly
            stages={pipeline.per_task}
            activeStage={activeStage}
          />
        )}
      </Lane>

      <DownArrow label="all backlog items checked" />

      <Lane title="on_backlog_complete" subtitle="ran once per iteration">
        <div className="flex flex-wrap items-center gap-2">
          {pipeline.on_backlog_complete.map((step, i) => (
            <div key={step.run + i} className="flex items-center gap-2">
              <Node label={step.run} kind="command" active={false} />
              {i < pipeline.on_backlog_complete.length - 1 && <ArrowRight />}
            </div>
          ))}
        </div>
      </Lane>

      <DownArrow label="exit code → decider" />

      <Lane title="decider" subtitle="agent — reads STATE.md, decides">
        <DeciderNode decision={decision} running={running} />
      </Lane>

      <CyclicLoopArc highlighted={decision === "loop"} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// per_task lane — read-only and editable variants
// ---------------------------------------------------------------------------

function PerTaskLaneReadOnly({
  stages,
  activeStage,
}: {
  stages: string[];
  activeStage: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {stages.map((stageName, i) => (
        <div key={stageName + i} className="flex items-center gap-2">
          <Node
            label={stageName}
            kind="stage"
            active={activeStage === stageName}
          />
          {i < stages.length - 1 && <ArrowRight />}
        </div>
      ))}
    </div>
  );
}

const STAGE_DRAG_TYPE = "application/x-caffeine-stage";

function PerTaskLaneEditable({
  stages,
  onChange,
}: {
  stages: string[];
  onChange: (next: string[]) => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [hoverGap, setHoverGap] = useState<number | null>(null);

  const onStageDragStart = (i: number) => (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(
      STAGE_DRAG_TYPE,
      JSON.stringify({ kind: "stage", from: i }),
    );
    setDragIndex(i);
  };

  const onDrop = (atIndex: number) => (e: React.DragEvent) => {
    e.preventDefault();
    setHoverGap(null);
    setDragIndex(null);
    const raw = e.dataTransfer.getData(STAGE_DRAG_TYPE);
    if (!raw) return;
    let payload: { kind: "stage"; from: number } | { kind: "palette"; name: string };
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }
    if (payload.kind === "stage") {
      const next = [...stages];
      const [moved] = next.splice(payload.from, 1);
      const insertAt = atIndex > payload.from ? atIndex - 1 : atIndex;
      next.splice(insertAt, 0, moved);
      onChange(next);
    } else if (payload.kind === "palette") {
      // Don't add duplicates — silently no-op if the agent is already in the lane.
      if (stages.includes(payload.name)) return;
      const next = [...stages];
      next.splice(atIndex, 0, payload.name);
      onChange(next);
    }
  };

  const onRemove = (i: number) => () => {
    if (stages.length <= 1) return; // never let the lane go empty via a click
    const next = [...stages];
    next.splice(i, 1);
    onChange(next);
  };

  const allowDrop = (gap: number) => (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(STAGE_DRAG_TYPE)) {
      e.preventDefault();
      setHoverGap(gap);
    }
  };

  return (
    <div
      className="flex flex-wrap items-center gap-1"
      onDragLeave={(e) => {
        // only clear when leaving the lane container, not when crossing
        // between children
        if (e.currentTarget === e.target) setHoverGap(null);
      }}
    >
      {stages.map((stageName, i) => (
        <Fragment key={stageName + ":" + i}>
          <DropGap
            active={hoverGap === i}
            onDragOver={allowDrop(i)}
            onDrop={onDrop(i)}
          />
          <DraggableStage
            name={stageName}
            removable={stages.length > 1}
            dimmed={dragIndex === i}
            onDragStart={onStageDragStart(i)}
            onDragEnd={() => {
              setDragIndex(null);
              setHoverGap(null);
            }}
            onRemove={onRemove(i)}
          />
        </Fragment>
      ))}
      <DropGap
        active={hoverGap === stages.length}
        onDragOver={allowDrop(stages.length)}
        onDrop={onDrop(stages.length)}
      />
    </div>
  );
}

function DraggableStage({
  name,
  removable,
  dimmed,
  onDragStart,
  onDragEnd,
  onRemove,
}: {
  name: string;
  removable: boolean;
  dimmed: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`group flex cursor-grab items-center gap-1.5 rounded border px-2 py-1 text-xs transition ${
        dimmed
          ? "border-zinc-800 bg-zinc-900/40 text-zinc-600"
          : "border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-600"
      }`}
    >
      <span className="text-zinc-600 select-none">⋮⋮</span>
      <span>{name}</span>
      {removable && (
        <button
          type="button"
          onClick={onRemove}
          title="Remove stage"
          className="ml-1 text-zinc-600 opacity-0 transition group-hover:opacity-100 hover:text-red-400"
        >
          ✕
        </button>
      )}
    </div>
  );
}

function DropGap({
  active,
  onDragOver,
  onDrop,
}: {
  active: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`h-7 w-2 rounded-sm transition ${
        active ? "bg-emerald-500/70" : "bg-transparent"
      }`}
    />
  );
}

// ---------------------------------------------------------------------------
// Lane / Node / Decider primitives (shared)
// ---------------------------------------------------------------------------

function Lane({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
      <div className="mb-3 flex items-baseline gap-2">
        <span className="font-mono text-xs text-zinc-300">{title}</span>
        {subtitle && (
          <span className="text-[11px] text-zinc-500">— {subtitle}</span>
        )}
      </div>
      {children}
    </div>
  );
}

type NodeKind = "stage" | "command" | "decider" | "terminal" | "loop";

function Node({
  label,
  kind,
  active,
  tone,
}: {
  label: string;
  kind: NodeKind;
  active: boolean;
  tone?: "ok" | "warn" | "bad";
}) {
  const isCmd = kind === "command";
  const isTerminal = kind === "terminal" || kind === "loop";

  let border = "border-zinc-700";
  let bg = "bg-zinc-900";
  let text = "text-zinc-200";
  let shadow = "";

  if (active) {
    border = "border-emerald-500";
    bg = "bg-emerald-950/40";
    text = "text-emerald-200";
    shadow = "shadow-[0_0_16px_-4px_rgba(16,185,129,0.6)]";
  } else if (tone === "ok") {
    border = "border-emerald-700";
    text = "text-emerald-300";
  } else if (tone === "warn") {
    border = "border-amber-600";
    text = "text-amber-300";
  } else if (tone === "bad") {
    border = "border-red-600";
    text = "text-red-300";
  }

  return (
    <div
      className={`rounded ${isTerminal ? "px-3 py-1" : "px-3 py-1.5"} ${border} ${bg} ${text} ${shadow} border ${
        isCmd ? "font-mono text-[11px]" : "text-xs"
      } whitespace-nowrap transition`}
    >
      {label}
    </div>
  );
}

function ArrowRight() {
  return (
    <div className="flex items-center text-zinc-600">
      <div className="h-px w-4 bg-zinc-700" />
      <div className="-ml-0.5 text-[10px] leading-none">▸</div>
    </div>
  );
}

function DownArrow({ label }: { label?: string }) {
  return (
    <div className="my-1 flex items-center justify-center gap-2 text-[11px] text-zinc-500">
      <div className="flex flex-col items-center text-zinc-600">
        <div className="h-5 w-px bg-zinc-700" />
        <div className="-mt-1 text-[10px] leading-none">▾</div>
      </div>
      {label && <span>{label}</span>}
    </div>
  );
}

function DeciderNode({
  decision,
  running,
}: {
  decision: Decision;
  running: boolean;
}) {
  return (
    <div className="flex items-start gap-6">
      <Node
        label="decider (subagent)"
        kind="decider"
        active={running && decision === null}
      />
      <div className="flex flex-col gap-2 pt-0.5">
        <div className="flex items-center gap-2">
          <DeciderEdge label="done" />
          <Node
            label="✓ done"
            kind="terminal"
            active={false}
            tone={decision === "done" ? "ok" : undefined}
          />
        </div>
        <div className="flex items-center gap-2">
          <DeciderEdge label="loop" tone="warn" />
          <Node
            label="↻ loop  →  appends [LOOP-N] to BACKLOG, restarts"
            kind="loop"
            active={false}
            tone={decision === "loop" ? "warn" : undefined}
          />
        </div>
        <div className="flex items-center gap-2">
          <DeciderEdge label="halt" tone="bad" />
          <Node
            label="⏹ halt (max iterations)"
            kind="terminal"
            active={false}
            tone={decision === "halt" ? "bad" : undefined}
          />
        </div>
      </div>
    </div>
  );
}

function DeciderEdge({
  label,
  tone,
}: {
  label: string;
  tone?: "warn" | "bad";
}) {
  const color =
    tone === "warn"
      ? "text-amber-400 border-amber-700"
      : tone === "bad"
        ? "text-red-400 border-red-800"
        : "text-emerald-400 border-emerald-800";
  return (
    <div className={`flex items-center gap-1 ${color}`}>
      <div className="h-px w-4 bg-current opacity-60" />
      <span className="text-[10px] uppercase tracking-wide">{label}</span>
      <div className="-ml-0.5 text-[10px] leading-none">▸</div>
    </div>
  );
}

/**
 * The back-edge from decider → top of graph. Rendered as an absolutely
 * positioned SVG on the right margin of the graph so it visually
 * connects the decider's loop output back to the per_task lane.
 */
function CyclicLoopArc({ highlighted }: { highlighted: boolean }) {
  const stroke = highlighted ? "#f59e0b" : "#52525b";
  const strokeOpacity = highlighted ? 1 : 0.5;

  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute -right-12 top-0 h-full w-12 text-amber-400"
      viewBox="0 0 48 100"
      preserveAspectRatio="none"
    >
      <defs>
        <marker
          id="arrowhead-loop"
          markerWidth="6"
          markerHeight="6"
          refX="3"
          refY="3"
          orient="auto"
        >
          <path d="M 0 0 L 6 3 L 0 6 z" fill={stroke} fillOpacity={strokeOpacity} />
        </marker>
      </defs>
      <path
        d="M 4 92 Q 44 50 4 8"
        fill="none"
        stroke={stroke}
        strokeOpacity={strokeOpacity}
        strokeWidth="1.5"
        strokeDasharray={highlighted ? "0" : "4 3"}
        markerEnd="url(#arrowhead-loop)"
      />
      <text
        x="24"
        y="50"
        fill={stroke}
        fillOpacity={strokeOpacity}
        fontSize="9"
        fontFamily="ui-monospace, monospace"
        textAnchor="middle"
        transform="rotate(-90 24 50)"
      >
        loop
      </text>
    </svg>
  );
}
