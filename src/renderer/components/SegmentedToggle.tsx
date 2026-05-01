// Tiny segmented control for view-mode toggles. Used by Pipeline,
// Backlog, and State views to switch between rendered ("Read") and
// raw ("Raw") views — and any other small mode-switch where a
// dropdown would be overkill.

export type SegmentedOption<T extends string> = {
  id: T;
  label: string;
  disabled?: boolean;
  title?: string;
};

export function SegmentedToggle<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (next: T) => void;
}) {
  return (
    <div className="flex items-center rounded border border-zinc-800 bg-zinc-950 p-0.5">
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            disabled={opt.disabled}
            title={opt.title}
            className={`rounded px-2 py-0.5 text-[11px] transition disabled:cursor-not-allowed disabled:opacity-40 ${
              active
                ? "bg-zinc-800 text-zinc-100"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
