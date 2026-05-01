import { useState } from "react";
import type { TranscriptRow as Row } from "../store";

export function TranscriptRow({ row }: { row: Row }) {
  if (row.kind === "text") return <TextRow row={row} />;
  return <ToolRow row={row} />;
}

function TextRow({ row }: { row: Extract<Row, { kind: "text" }> }) {
  return (
    <div className="px-4 py-2 text-sm leading-relaxed text-zinc-200 whitespace-pre-wrap">
      {row.text}
    </div>
  );
}

function ToolRow({ row }: { row: Extract<Row, { kind: "tool" }> }) {
  const [open, setOpen] = useState(false);
  const dur =
    row.finishedAt && row.startedAt
      ? `${((row.finishedAt - row.startedAt) / 1000).toFixed(2)}s`
      : null;

  const dot =
    row.status === "pending"
      ? "bg-amber-400 animate-pulse"
      : row.status === "error"
        ? "bg-red-500"
        : "bg-emerald-500";

  return (
    <div className="px-4 py-1.5 text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-left text-zinc-400 hover:text-zinc-200"
      >
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${dot}`} />
        <span className="font-mono text-zinc-300">{row.name}</span>
        <span className="truncate text-zinc-500">{summarize(row.input)}</span>
        {dur && <span className="text-zinc-600">{dur}</span>}
      </button>
      {open && (
        <pre className="ml-3.5 mt-1 max-h-64 overflow-auto rounded border border-zinc-800 bg-zinc-900/60 p-2 text-[11px] text-zinc-400">
          {prettyPrint({ input: row.input, output: row.output })}
        </pre>
      )}
    </div>
  );
}

function summarize(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const obj = input as Record<string, unknown>;
  const candidates = ["command", "file_path", "path", "pattern", "description"];
  for (const k of candidates) {
    const v = obj[k];
    if (typeof v === "string") return v.length > 80 ? `${v.slice(0, 80)}…` : v;
  }
  const json = JSON.stringify(obj);
  return json.length > 80 ? `${json.slice(0, 80)}…` : json;
}

function prettyPrint(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
