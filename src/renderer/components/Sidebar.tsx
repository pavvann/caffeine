import { useStore } from "../store";
import {
  IconBacklog,
  IconPipeline,
  IconSession,
  IconSettings,
  IconState,
} from "./Icons";

type ViewId = "session" | "backlog" | "pipeline" | "state" | "settings";

type TabDef = {
  id: ViewId;
  label: string;
  Icon: (p: { size?: number }) => React.ReactElement;
};

const TABS: TabDef[] = [
  { id: "session", label: "Session", Icon: IconSession },
  { id: "backlog", label: "Backlog", Icon: IconBacklog },
  { id: "pipeline", label: "Pipeline", Icon: IconPipeline },
  { id: "state", label: "State", Icon: IconState },
  { id: "settings", label: "Settings", Icon: IconSettings },
];

export function Sidebar() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const status = useStore((s) => s.status);
  const cost = useStore((s) => s.cost);
  const currentIteration = useStore((s) => s.currentIteration);
  const currentTaskIndex = useStore((s) => s.currentTaskIndex);
  const currentTaskTotal = useStore((s) => s.currentTaskTotal);

  const isRunning = status === "running" || status === "paused";

  const backlogBadge =
    currentTaskTotal > 0 && currentTaskIndex >= 1
      ? `${currentTaskIndex}/${currentTaskTotal}`
      : null;
  const pipelineBadge =
    isRunning && currentIteration > 0 ? `i${currentIteration}` : null;

  return (
    <nav
      style={{
        width: 176,
        flexShrink: 0,
        background: "var(--bg-2)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        padding: "12px 8px",
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 10,
          color: "var(--text-4)",
          letterSpacing: 0.8,
          textTransform: "uppercase",
          padding: "4px 10px 8px",
        }}
      >
        Workspace
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {TABS.map((tab) => {
          const isActive = view === tab.id;
          const badge =
            tab.id === "backlog"
              ? backlogBadge
              : tab.id === "pipeline"
                ? pipelineBadge
                : null;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setView(tab.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "7px 10px",
                paddingLeft: isActive ? 8 : 10,
                color: isActive ? "var(--text)" : "var(--text-2)",
                background: isActive ? "rgba(255,255,255,0.04)" : "transparent",
                fontSize: 12.5,
                fontWeight: isActive ? 500 : 400,
                borderLeft: isActive
                  ? "2px solid var(--emerald)"
                  : "2px solid transparent",
                textAlign: "left",
              }}
            >
              <tab.Icon size={13} />
              <span>{tab.label}</span>
              {badge && (
                <span
                  className="mono"
                  style={{
                    marginLeft: "auto",
                    fontSize: 10,
                    color: "var(--text-3)",
                    background: "var(--surface)",
                    padding: "1px 5px",
                    border: "1px solid var(--border)",
                  }}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div
        style={{
          marginTop: "auto",
          padding: "8px 10px",
          borderTop: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <div
          className="mono"
          style={{
            fontSize: 10,
            color: "var(--text-4)",
            letterSpacing: 0.6,
            textTransform: "uppercase",
          }}
        >
          Run
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            className={status === "running" ? "dot-pulse-emerald" : ""}
            style={{
              width: 6,
              height: 6,
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
              fontSize: 11,
              color:
                status === "running"
                  ? "var(--emerald-300)"
                  : status === "paused"
                    ? "var(--amber)"
                    : status === "error"
                      ? "var(--red)"
                      : "var(--text-3)",
            }}
          >
            {status}
          </span>
        </div>
        {isRunning && currentIteration > 0 && (
          <div
            className="mono"
            style={{ fontSize: 10.5, color: "var(--text-3)" }}
          >
            iter {currentIteration}
          </div>
        )}
        <div className="mono" style={{ fontSize: 10.5, color: "var(--text-3)" }}>
          ${cost.costUsd.toFixed(2)}
        </div>
      </div>
    </nav>
  );
}
