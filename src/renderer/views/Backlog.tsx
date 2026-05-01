// BACKLOG.md viewer/editor. Two modes:
//
//   Read — rendered markdown via MarkdownView, plus a clickable
//          checkbox list along the right rail so users can tick items
//          without dropping into raw mode. The clickable list is the
//          primary interaction; the rendered markdown is for context
//          (headings, prose, sub-bullets the user wrote).
//   Raw  — full-width markdown editor (textarea). Debounced write
//          to disk on edit, immediate flush on toggle/checkbox change.
//
// Source of truth on disk is BACKLOG.md. Both modes write back through
// `window.caffeine.backlog.write`.

import { useCallback, useEffect, useRef, useState } from "react";
import { MarkdownView } from "../components/MarkdownView";
import { SegmentedToggle } from "../components/SegmentedToggle";

type Mode = "read" | "raw";

type Item = { lineIndex: number; text: string; checked: boolean };

const TASK_LINE_RE = /^\s*[-*]\s+\[([ xX])\]\s+(.*)$/;

function parse(md: string): Item[] {
  const items: Item[] = [];
  md.split(/\r?\n/).forEach((line, i) => {
    const m = line.match(TASK_LINE_RE);
    if (!m) return;
    items.push({
      lineIndex: i,
      text: m[2],
      checked: m[1].toLowerCase() === "x",
    });
  });
  return items;
}

function toggle(md: string, lineIndex: number): string {
  const lines = md.split(/\r?\n/);
  if (lineIndex < 0 || lineIndex >= lines.length) return md;
  lines[lineIndex] = lines[lineIndex].replace(
    /^(\s*[-*]\s+)\[([ xX])\]/,
    (_, prefix: string, mark: string) =>
      `${prefix}[${mark === " " ? "x" : " "}]`,
  );
  return lines.join("\n");
}

export function Backlog() {
  const [text, setText] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<Mode>("read");
  const debounce = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void window.caffeine.backlog.read().then((md: string) => {
      if (cancelled) return;
      setText(md ?? "");
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback((next: string) => {
    if (debounce.current) window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => {
      void window.caffeine.backlog.write(next);
    }, 300);
  }, []);

  const flush = useCallback((next: string) => {
    if (debounce.current) window.clearTimeout(debounce.current);
    void window.caffeine.backlog.write(next);
  }, []);

  const onEditRaw = (next: string) => {
    setText(next);
    persist(next);
  };

  const onToggle = (lineIndex: number) => {
    const next = toggle(text, lineIndex);
    setText(next);
    flush(next); // toggling is a real action — write immediately
  };

  if (!loaded) {
    return (
      <div className="grid h-full place-items-center text-sm text-zinc-500">
        Loading backlog…
      </div>
    );
  }

  const items = parse(text);
  const open = items.filter((i) => !i.checked).length;
  const done = items.length - open;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center gap-3 border-b border-zinc-800 bg-zinc-900/40 px-3 text-xs text-zinc-500">
        <span className="font-mono text-zinc-400">BACKLOG.md</span>
        {items.length > 0 && (
          <>
            <span className="text-zinc-600">·</span>
            <span className="font-mono text-zinc-400">
              {done}/{items.length} done
            </span>
          </>
        )}
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

      {mode === "raw" ? (
        <textarea
          value={text}
          onChange={(e) => onEditRaw(e.target.value)}
          spellCheck={false}
          placeholder="# Backlog&#10;&#10;- [ ] Your first task"
          className="flex-1 resize-none bg-zinc-950 p-6 font-mono text-sm leading-6 text-zinc-200 focus:outline-none"
        />
      ) : (
        <div className="flex flex-1 min-h-0">
          <div className="flex-1 min-w-0 overflow-y-auto">
            <MarkdownView content={text} />
          </div>
          <aside className="flex w-80 shrink-0 flex-col border-l border-zinc-800">
            <div className="flex h-8 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-900/40 px-3 text-[11px] text-zinc-500">
              <span>Tasks</span>
              <span className="font-mono">
                {done}/{items.length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {items.length === 0 ? (
                <div className="px-2 py-4 text-xs text-zinc-600">
                  No tasks parsed. Add lines like “- [ ] Do the thing”.
                </div>
              ) : (
                items.map((item) => (
                  <label
                    key={item.lineIndex}
                    className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 hover:bg-zinc-900"
                  >
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={() => onToggle(item.lineIndex)}
                      className="mt-1 accent-emerald-500"
                    />
                    <span
                      className={`text-sm ${item.checked ? "text-zinc-500 line-through" : "text-zinc-200"}`}
                    >
                      {item.text}
                    </span>
                  </label>
                ))
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
