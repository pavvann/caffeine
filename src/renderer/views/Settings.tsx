import { useEffect, useRef, useState } from "react";
import type { CaffeineConfig } from "@shared/types";

const MODELS = [
  { id: "claude-opus-4-7", label: "Opus 4.7 (most capable, $$$)" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6 (balanced)" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5 (fast, cheap)" },
];

export function Settings() {
  const [config, setConfig] = useState<CaffeineConfig>({});
  const [savingConfig, setSavingConfig] = useState(false);
  const debounce = useRef<number | null>(null);

  useEffect(() => {
    void window.caffeine.config.read().then((c) => {
      setConfig((c as CaffeineConfig) ?? {});
    });
  }, []);

  const updateConfig = (next: CaffeineConfig) => {
    setConfig(next);
    if (debounce.current) window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(async () => {
      setSavingConfig(true);
      try {
        await window.caffeine.config.write(next);
      } finally {
        setSavingConfig(false);
      }
    }, 400);
  };

  const setVerification = (
    key: keyof NonNullable<CaffeineConfig["verification"]>,
    value: string,
  ) => {
    updateConfig({
      ...config,
      verification: { ...config.verification, [key]: value || undefined },
    });
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="border-b border-zinc-800 px-6 py-4">
        <h2 className="text-base font-medium text-zinc-200">Settings</h2>
      </header>
      <div className="space-y-6 p-6">

        <Section
          title="Authentication"
          subtitle="Caffeine uses your local Claude Code login (~/.claude/). Run `claude` in a terminal and sign in once — Caffeine inherits the session."
        >
          <div className="rounded border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-xs text-zinc-400">
            No key needed. If a session fails to start, run <span className="font-mono text-zinc-200">claude</span> from your terminal to confirm you&apos;re signed in.
          </div>
        </Section>

        <Section title="Model" subtitle="Used for the main agent loop. Reviewer subagent inherits.">
          <select
            value={config.model ?? "claude-opus-4-7"}
            onChange={(e) => updateConfig({ ...config, model: e.target.value })}
            className="w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-200 focus:border-zinc-600 focus:outline-none"
          >
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </Section>

        <Section
          title="Verification commands"
          subtitle="The agent runs these after each meaningful edit. Leave blank to skip."
        >
          <div className="space-y-2">
            {(["test", "build", "lint", "typecheck"] as const).map((k) => (
              <div key={k} className="flex items-center gap-3">
                <label className="w-24 text-xs text-zinc-500">{k}</label>
                <input
                  type="text"
                  value={config.verification?.[k] ?? ""}
                  onChange={(e) => setVerification(k, e.target.value)}
                  placeholder={`pnpm ${k}`}
                  className="flex-1 rounded border border-zinc-800 bg-zinc-950 px-2 py-1 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
                />
              </div>
            ))}
          </div>
        </Section>

        <Section title="Cost ceiling (USD)" subtitle="Session stops automatically if exceeded.">
          <input
            type="number"
            min={1}
            step={1}
            value={config.costCeilingUsd ?? 25}
            onChange={(e) =>
              updateConfig({
                ...config,
                costCeilingUsd: Number(e.target.value) || undefined,
              })
            }
            className="w-32 rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-200 focus:border-zinc-600 focus:outline-none"
          />
        </Section>

        <div className="text-[11px] text-zinc-600">
          {savingConfig ? "Saving…" : "Project config saved to caffeine.config.json"}
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2">
        <div className="text-sm font-medium text-zinc-200">{title}</div>
        {subtitle && <div className="text-xs text-zinc-500">{subtitle}</div>}
      </div>
      {children}
    </section>
  );
}
