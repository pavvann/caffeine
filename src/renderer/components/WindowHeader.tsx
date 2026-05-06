import { useStore } from "../store";
import { IconChevron, IconFolder, Mobius } from "./Icons";

export function WindowHeader() {
  const project = useStore((s) => s.project);
  const setProject = useStore((s) => s.setProject);

  return (
    <header
      className="h-10 shrink-0 flex items-center gap-3.5 [-webkit-app-region:drag]"
      style={{
        padding: "0 14px 0 88px", // 88px left to clear macOS traffic lights
        background: "rgba(11,11,14,0.85)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div className="flex items-center gap-[7px]">
        <Mobius size={16} />
        <span
          className="mono"
          style={{
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: 0.2,
            color: "var(--text)",
          }}
        >
          caffeine
        </span>
        <span style={{ color: "var(--text-4)", fontSize: 11 }}>v0.0.3</span>
      </div>

      {project && (
        <div className="flex flex-1 items-center justify-center gap-2">
          <IconFolder size={11} stroke="var(--text-3)" />
          <span
            className="mono"
            style={{ fontSize: 11, color: "var(--text-2)" }}
          >
            {project.path.replace(/^\/Users\/[^/]+/, "~")}
          </span>
          <span style={{ color: "var(--text-4)", fontSize: 10 }}>·</span>
          <span
            className="mono"
            style={{ fontSize: 11, color: "var(--text-3)" }}
          >
            main
          </span>
        </div>
      )}

      {project && (
        <button
          type="button"
          onClick={() => setProject(null)}
          className="[-webkit-app-region:no-drag] flex items-center gap-1"
          style={{ fontSize: 11, color: "var(--text-3)" }}
        >
          switch project <IconChevron size={9} />
        </button>
      )}
    </header>
  );
}
