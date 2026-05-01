import { useStore } from "../store";

const ITEMS: Array<{ id: "session" | "backlog" | "state" | "settings"; label: string }> = [
  { id: "session", label: "Session" },
  { id: "backlog", label: "Backlog" },
  { id: "state", label: "State" },
  { id: "settings", label: "Settings" },
];

export function Sidebar() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);

  return (
    <nav className="w-44 shrink-0 border-r border-zinc-800 bg-zinc-950/60 p-2">
      {ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => setView(item.id)}
          className={`w-full rounded px-3 py-1.5 text-left text-sm ${
            view === item.id
              ? "bg-zinc-800 text-zinc-100"
              : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
          }`}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
