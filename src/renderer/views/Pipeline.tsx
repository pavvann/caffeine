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

import { useEffect, useState } from "react";
import { useStore } from "../store";
import type { PipelineWireShape } from "@shared/types";

export function Pipeline() {
  const live = useStore((s) => s.currentPipeline);
  const currentStage = useStore((s) => s.currentStage);
  const currentIteration = useStore((s) => s.currentIteration);
  const lastDecision = useStore((s) => s.lastDecision);
  const taskIndex = useStore((s) => s.currentTaskIndex);
  const taskTotal = useStore((s) => s.currentTaskTotal);

  const [diskPipeline, setDiskPipeline] = useState<PipelineWireShape | null>(
    null,
  );
  const [loaded, setLoaded] = useState(false);

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

  const pipeline = live ?? diskPipeline;

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

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <Header
        pipeline={pipeline}
        iteration={currentIteration}
        taskIndex={taskIndex}
        taskTotal={taskTotal}
      />
      <div className="flex-1 px-8 py-6">
        <Graph
          pipeline={pipeline}
          activeStage={currentStage}
          iteration={currentIteration}
          decision={lastDecision}
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
}: {
  pipeline: PipelineWireShape;
  iteration: number;
  taskIndex: number;
  taskTotal: number;
}) {
  const max = pipeline.decider.max_iterations;
  const iterDisplay = iteration > 0 ? `${iteration} / ${max}` : `— / ${max}`;
  const taskDisplay =
    taskIndex >= 1 && taskTotal >= 1 ? `${taskIndex} / ${taskTotal}` : null;

  return (
    <div className="flex h-9 shrink-0 items-center gap-4 border-b border-zinc-800 bg-zinc-900/40 px-4 text-xs text-zinc-400">
      <span className="font-mono text-zinc-300">pipeline.md</span>
      <span>·</span>
      <span>
        Iteration <span className="font-mono text-zinc-200">{iterDisplay}</span>
      </span>
      {taskDisplay && (
        <>
          <span>·</span>
          <span>
            Task <span className="font-mono text-zinc-200">{taskDisplay}</span>
          </span>
        </>
      )}
    </div>
  );
}

type Decision = "done" | "loop" | "halt" | null;

function Graph({
  pipeline,
  activeStage,
  iteration,
  decision,
}: {
  pipeline: PipelineWireShape;
  activeStage: string | null;
  iteration: number;
  decision: Decision;
}) {
  const running = iteration > 0;

  return (
    <div className="relative mx-auto max-w-3xl">
      {/* Per-task lane */}
      <Lane
        title="per_task"
        subtitle="runs for each unchecked BACKLOG.md item"
      >
        <div className="flex flex-wrap items-center gap-2">
          {pipeline.per_task.map((stageName, i) => (
            <div key={stageName + i} className="flex items-center gap-2">
              <Node
                label={stageName}
                kind="stage"
                active={activeStage === stageName}
              />
              {i < pipeline.per_task.length - 1 && <ArrowRight />}
            </div>
          ))}
        </div>
      </Lane>

      <DownArrow label="all backlog items checked" />

      {/* On-backlog-complete lane */}
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

      {/* Decider with three conditional outputs */}
      <Lane title="decider" subtitle="agent — reads STATE.md, decides">
        <DeciderNode decision={decision} running={running} />
      </Lane>

      {/* Cyclic feedback edge: decider → top of graph (per_task lane).
          Drawn as an SVG arc on the right side. Visible whenever the
          last decision was "loop", or always-on in idle so the user
          can see the topology. */}
      <CyclicLoopArc highlighted={decision === "loop"} />
    </div>
  );
}

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
      {/* Curve from bottom-left (decider's loop edge) up to top-left
          (per_task lane). Drawn as a quadratic curve through the right
          margin so it doesn't overlap the lanes themselves. */}
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
