import { useCallback, useEffect, useState } from "react";
import type { Project } from "@shared/types";
import { IconFolder, IconPlus } from "../components/Icons";

type Props = {
  onOpened: (project: Project) => void;
};

export function ProjectPicker({ onOpened }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);

  const refresh = useCallback(async () => {
    const list = (await window.caffeine.project.list()) as Project[];
    setProjects(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const open = async (path: string | null) => {
    setOpening(true);
    try {
      const project = (await window.caffeine.project.open(
        path as string,
      )) as Project | null;
      if (project) onOpened(project);
    } finally {
      setOpening(false);
    }
  };

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        background: "var(--bg)",
      }}
    >
      <header
        style={{
          padding: "20px 28px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div>
          <h2
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "var(--text)",
              margin: 0,
              letterSpacing: -0.2,
            }}
          >
            Projects
          </h2>
          <p
            style={{
              fontSize: 12,
              color: "var(--text-4)",
              marginTop: 4,
              maxWidth: 520,
              lineHeight: 1.55,
            }}
          >
            Pick a repo to open. Caffeine creates BACKLOG.md, STATE.md, and
            caffeine.config.json on first open.
          </p>
        </div>
        <button
          type="button"
          disabled={opening}
          onClick={() => open(null)}
          className="mono"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "7px 12px",
            border: "1px solid var(--emerald)",
            background: "rgba(16,185,129,0.08)",
            color: "var(--emerald-300)",
            fontSize: 11.5,
            opacity: opening ? 0.5 : 1,
          }}
        >
          <IconPlus size={11} /> open repo…
        </button>
      </header>

      <div style={{ flex: 1, overflow: "auto", padding: "16px 24px" }}>
        {loading ? (
          <div style={{ fontSize: 12, color: "var(--text-3)" }}>Loading…</div>
        ) : projects.length === 0 ? (
          <div
            style={{
              display: "grid",
              placeItems: "center",
              height: "100%",
              fontSize: 12,
              color: "var(--text-3)",
              textAlign: "center",
            }}
          >
            No projects yet. Click “open repo…” to add one.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {projects.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => open(p.path)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "12px 14px",
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  textAlign: "left",
                  color: "var(--text-2)",
                }}
              >
                <span
                  style={{
                    width: 32,
                    height: 32,
                    background: "var(--bg-2)",
                    border: "1px solid var(--border)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--text-3)",
                  }}
                >
                  <IconFolder size={14} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--text)",
                      fontWeight: 500,
                    }}
                  >
                    {p.name}
                  </div>
                  <div
                    className="mono"
                    style={{
                      fontSize: 11,
                      color: "var(--text-4)",
                      marginTop: 1,
                    }}
                  >
                    {p.path}
                  </div>
                </div>
                <span
                  className="mono"
                  style={{
                    fontSize: 10.5,
                    color: p.lastSessionId ? "var(--emerald-300)" : "var(--text-4)",
                    padding: "2px 8px",
                    border: `1px solid ${p.lastSessionId ? "rgba(16,185,129,0.3)" : "var(--border)"}`,
                  }}
                >
                  {p.lastSessionId ? "resumable" : "new"}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
