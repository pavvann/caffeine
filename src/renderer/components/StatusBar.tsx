import type { ReactNode } from "react";

// Generic tab header used by Backlog, Pipeline, State, Settings.
// The Session tab uses its own richer status header — see views/Session.tsx.
export function StatusBar({
  tabLabel,
  sub,
  right,
}: {
  tabLabel: string;
  sub?: string;
  right?: ReactNode;
}) {
  return (
    <div
      style={{
        height: 36,
        padding: "0 16px",
        borderBottom: "1px solid var(--border)",
        background: "rgba(15,15,19,0.6)",
        display: "flex",
        alignItems: "center",
        flexShrink: 0,
        gap: 12,
      }}
    >
      <span style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 500 }}>
        {tabLabel}
      </span>
      {sub && (
        <>
          <span
            style={{
              width: 1,
              height: 12,
              background: "var(--border)",
            }}
          />
          <span
            className="mono"
            style={{ fontSize: 11, color: "var(--text-3)" }}
          >
            {sub}
          </span>
        </>
      )}
      {right && (
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          {right}
        </div>
      )}
    </div>
  );
}

export function SegToggle<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: T[];
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        border: "1px solid var(--border)",
        background: "var(--bg-2)",
        padding: 1.5,
      }}
    >
      {options.map((opt) => {
        const active = value === opt;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className="mono"
            style={{
              padding: "3px 10px",
              fontSize: 11,
              color: active ? "var(--text)" : "var(--text-3)",
              background: active ? "var(--surface-2)" : "transparent",
              textTransform: "lowercase",
            }}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}
