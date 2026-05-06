import { useCallback, useEffect, useRef, useState } from "react";
import { MarkdownView } from "../components/MarkdownView";
import { SegToggle, StatusBar } from "../components/StatusBar";
import { IconCheck } from "../components/Icons";

type Mode = "read" | "raw";
type Item = { lineIndex: number; text: string; checked: boolean; loop?: string };

const TASK_LINE_RE = /^\s*[-*]\s+\[([ xX])\]\s+(.*)$/;
const LOOP_TAG_RE = /\[(LOOP-\d+)\]\s*/;

function parse(md: string): Item[] {
  const items: Item[] = [];
  md.split(/\r?\n/).forEach((line, i) => {
    const m = line.match(TASK_LINE_RE);
    if (!m) return;
    let text = m[2];
    let loop: string | undefined;
    const loopMatch = text.match(LOOP_TAG_RE);
    if (loopMatch) {
      loop = loopMatch[1];
      text = text.replace(LOOP_TAG_RE, "");
    }
    items.push({ lineIndex: i, text, checked: m[1].toLowerCase() === "x", loop });
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

function Checkbox({ checked, active }: { checked: boolean; active?: boolean }) {
  return (
    <span
      style={{
        width: 13,
        height: 13,
        flexShrink: 0,
        border: `1px solid ${
          checked ? "var(--emerald)" : active ? "var(--amber)" : "var(--border-2)"
        }`,
        background: checked ? "var(--emerald)" : "transparent",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        marginTop: 2,
      }}
    >
      {checked && <IconCheck size={10} stroke="#0b0b0e" strokeWidth={2.2} />}
      {active && !checked && (
        <span
          className="dot-pulse-amber"
          style={{
            width: 5,
            height: 5,
            background: "var(--amber)",
            borderRadius: "50%",
          }}
        />
      )}
    </span>
  );
}

function TaskRail({
  items,
  activeIndex,
  onToggle,
}: {
  items: Item[];
  activeIndex: number;
  onToggle: (lineIndex: number) => void;
}) {
  const done = items.filter((i) => i.checked).length;

  return (
    <div
      style={{
        width: 320,
        flexShrink: 0,
        borderLeft: "1px solid var(--border)",
        background: "var(--bg-2)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "14px 16px 10px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div
          className="mono"
          style={{
            fontSize: 10,
            color: "var(--text-4)",
            textTransform: "uppercase",
            letterSpacing: 0.8,
          }}
        >
          Task list
        </div>
        <div
          style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 2 }}
        >
          <span
            className="mono"
            style={{ fontSize: 22, color: "var(--text)", fontWeight: 600 }}
          >
            {done}
          </span>
          <span className="mono" style={{ fontSize: 13, color: "var(--text-3)" }}>
            / {items.length}
          </span>
          <span
            style={{ fontSize: 11, color: "var(--text-3)", marginLeft: 6 }}
          >
            complete
          </span>
        </div>
        {items.length > 0 && (
          <div style={{ marginTop: 10, display: "flex", gap: 3 }}>
            {items.map((t, i) => {
              const isActive = i === activeIndex;
              return (
                <div
                  key={t.lineIndex}
                  style={{
                    flex: 1,
                    height: 4,
                    background: t.checked
                      ? "var(--emerald)"
                      : isActive
                        ? "var(--amber)"
                        : "var(--border)",
                    opacity: isActive ? 0.9 : 1,
                  }}
                />
              );
            })}
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "8px 8px" }}>
        {items.length === 0 ? (
          <div
            style={{
              padding: "16px 10px",
              fontSize: 11.5,
              color: "var(--text-4)",
            }}
          >
            No tasks parsed. Add lines like “- [ ] Do the thing”.
          </div>
        ) : (
          items.map((t, i) => {
            const isActive = i === activeIndex;
            return (
              <label
                key={t.lineIndex}
                style={{
                  display: "flex",
                  gap: 9,
                  padding: "8px 9px",
                  alignItems: "flex-start",
                  background: isActive ? "rgba(251,191,36,0.04)" : "transparent",
                  borderLeft: isActive
                    ? "2px solid var(--amber)"
                    : "2px solid transparent",
                  marginBottom: 1,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={t.checked}
                  onChange={() => onToggle(t.lineIndex)}
                  style={{ display: "none" }}
                />
                <Checkbox checked={t.checked} active={isActive} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="mono" style={{ fontSize: 10, color: "var(--text-4)" }}>
                    #{String(i + 1).padStart(2, "0")}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: t.checked ? "var(--text-4)" : "var(--text)",
                      textDecoration: t.checked ? "line-through" : "none",
                      lineHeight: 1.4,
                    }}
                  >
                    {t.text}
                  </div>
                  {t.loop && (
                    <div
                      className="mono"
                      style={{ fontSize: 9.5, color: "var(--amber)", marginTop: 2 }}
                    >
                      [{t.loop}]
                    </div>
                  )}
                </div>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}

function RawEditor({
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
        placeholder="# Backlog&#10;&#10;- [ ] Your first task"
      />
    </div>
  );
}

export function Backlog() {
  const [text, setText] = useState("");
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
        Loading backlog…
      </div>
    );
  }

  const items = parse(text);
  const done = items.filter((i) => i.checked).length;
  const activeIndex = items.findIndex((i) => !i.checked);

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
        tabLabel="BACKLOG.md"
        sub={
          items.length > 0
            ? `${done} of ${items.length} done`
            : "no tasks yet"
        }
        right={<SegToggle value={mode} onChange={setMode} options={["read", "raw"]} />}
      />
      {mode === "read" ? (
        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          <div style={{ flex: 1, minWidth: 0, overflow: "auto" }}>
            <MarkdownView content={text} />
          </div>
          <TaskRail
            items={items}
            activeIndex={activeIndex}
            onToggle={(idx) => {
              const next = toggle(text, idx);
              setText(next);
              flush(next);
            }}
          />
        </div>
      ) : (
        <RawEditor
          value={text}
          onChange={(v) => {
            setText(v);
            persist(v);
          }}
        />
      )}
    </div>
  );
}
