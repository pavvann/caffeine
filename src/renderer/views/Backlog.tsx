import { useCallback, useEffect, useRef, useState } from "react";

// Lightweight checkbox parser/toggler — matches main/repo/backlog.ts.
// Keeping a copy here avoids round-tripping through IPC for instant UI
// feedback on toggle clicks; the source of truth on disk is still
// updated by writing the full markdown back.
type Item = { lineIndex: number; text: string; checked: boolean };

const RE = /^\s*[-*]\s+\[([ xX])\]\s+(.*)$/;

function parse(md: string): Item[] {
  const items: Item[] = [];
  md.split(/\r?\n/).forEach((line, i) => {
    const m = line.match(RE);
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

  const onEdit = (next: string) => {
    setText(next);
    persist(next);
  };

  const onToggle = (lineIndex: number) => {
    const next = toggle(text, lineIndex);
    setText(next);
    // toggling is a real action — flush immediately, no debounce
    if (debounce.current) window.clearTimeout(debounce.current);
    void window.caffeine.backlog.write(next);
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
    <div className="flex h-full">
      <section className="flex flex-1 min-w-0 flex-col border-r border-zinc-800">
        <div className="flex h-9 shrink-0 items-center border-b border-zinc-800 bg-zinc-900/40 px-3 text-xs text-zinc-500">
          BACKLOG.md
        </div>
        <textarea
          value={text}
          onChange={(e) => onEdit(e.target.value)}
          spellCheck={false}
          className="flex-1 resize-none bg-zinc-950 p-4 font-mono text-sm leading-6 text-zinc-200 focus:outline-none"
          placeholder="# Backlog&#10;&#10;- [ ] Your first task"
        />
      </section>
      <aside className="flex w-96 shrink-0 flex-col">
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-900/40 px-3 text-xs text-zinc-500">
          <span>Tasks</span>
          <span className="font-mono">
            {done}/{items.length}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {items.length === 0 && (
            <div className="px-2 py-4 text-xs text-zinc-600">
              No tasks parsed. Add lines like “- [ ] Do the thing”.
            </div>
          )}
          {items.map((item) => (
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
          ))}
        </div>
      </aside>
    </div>
  );
}
