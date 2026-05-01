import { useCallback, useEffect, useState } from "react";
import type { Project } from "@shared/types";

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
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
        <div>
          <h2 className="text-base font-medium text-zinc-200">Projects</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Pick a repo to open. Caffeine creates BACKLOG.md, STATE.md, and
            caffeine.config.json on first open.
          </p>
        </div>
        <button
          type="button"
          disabled={opening}
          onClick={() => open(null)}
          className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          Open repo…
        </button>
      </header>
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="text-sm text-zinc-500">Loading…</div>
        ) : projects.length === 0 ? (
          <div className="grid h-full place-items-center text-sm text-zinc-500">
            No projects yet. Click “Open repo…” to add one.
          </div>
        ) : (
          <ul className="space-y-1">
            {projects.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => open(p.path)}
                  className="flex w-full items-center justify-between rounded px-3 py-2 text-left hover:bg-zinc-900"
                >
                  <div>
                    <div className="text-sm text-zinc-200">{p.name}</div>
                    <div className="font-mono text-[11px] text-zinc-500">
                      {p.path}
                    </div>
                  </div>
                  <div className="text-[11px] text-zinc-600">
                    {p.lastSessionId ? "resumable" : "new"}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
