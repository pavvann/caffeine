import { useStore } from "../store";

export function StatusBar() {
  const {
    status,
    statusReason,
    cost,
    currentPipeline,
    currentTaskIndex,
    currentTaskTotal,
    currentStage,
    currentIteration,
    lastDecision,
  } = useStore();
  const dot =
    status === "running"
      ? "bg-emerald-500 animate-pulse"
      : status === "paused"
        ? "bg-amber-400"
        : status === "error"
          ? "bg-red-500"
          : status === "stopping"
            ? "bg-zinc-400"
            : "bg-zinc-600";

  const tokens = cost.inputTokens + cost.outputTokens;
  const pipelineLabel = currentPipeline
    ? formatPipelineLabel(
        currentTaskIndex,
        currentTaskTotal,
        currentStage,
        currentIteration,
      )
    : null;

  return (
    <div className="flex h-9 shrink-0 items-center gap-3 border-b border-zinc-800 bg-zinc-900/40 px-4 text-xs text-zinc-400">
      <span className="flex items-center gap-2">
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${dot}`} />
        <span className="capitalize">{status}</span>
      </span>
      {pipelineLabel && (
        <span className="font-mono text-emerald-300/80">{pipelineLabel}</span>
      )}
      {currentPipeline && lastDecision === "halt" && (
        <span className="font-mono text-amber-300">halted (max iterations)</span>
      )}
      {statusReason && <span className="text-zinc-500 truncate">{statusReason}</span>}
      <div className="ml-auto flex items-center gap-4 font-mono">
        <span>{formatTokens(tokens)} tok</span>
        <span>${cost.costUsd.toFixed(4)}</span>
      </div>
    </div>
  );
}

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

function formatPipelineLabel(
  taskIndex: number,
  taskTotal: number,
  stage: string | null,
  iteration: number,
): string {
  // Renders the spec format: `Task <index>/<total> · <stageName> ·
  // iteration <N>`. Before the first stage / iteration event of a
  // fresh session the values are sentinel; render placeholders rather
  // than confidently lying about iteration 1 when we haven't seen one.
  const taskPart =
    taskIndex >= 1 && taskTotal >= 1
      ? `Task ${taskIndex}/${taskTotal}`
      : "Task —";
  const iterPart = iteration > 0 ? `iteration ${iteration}` : "iteration —";
  const parts = [taskPart];
  if (stage) parts.push(stage);
  parts.push(iterPart);
  return parts.join(" · ");
}
