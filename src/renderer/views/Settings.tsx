import { useEffect, useRef, useState } from "react";
import type { CaffeineConfig } from "@shared/types";
import { useStore } from "../store";
import { StatusBar } from "../components/StatusBar";
import { IconBolt } from "../components/Icons";

const MODELS = [
  {
    id: "claude-opus-4-7",
    name: "claude-opus-4.7",
    sub: "best reasoning · slower · $15/M tok",
  },
  {
    id: "claude-sonnet-4-6",
    name: "claude-sonnet-4.6",
    sub: "balanced · default for most stages",
  },
  {
    id: "claude-haiku-4-5",
    name: "claude-haiku-4.5",
    sub: "fastest · best for reviewer + decider",
  },
];

function Section({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        borderBottom: "1px solid var(--border)",
        padding: "20px 28px",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
        <div style={{ width: 220, flexShrink: 0 }}>
          <div
            style={{
              fontSize: 12.5,
              color: "var(--text)",
              fontWeight: 600,
            }}
          >
            {title}
          </div>
          {sub && (
            <div
              style={{
                fontSize: 11.5,
                color: "var(--text-4)",
                marginTop: 3,
                lineHeight: 1.5,
              }}
            >
              {sub}
            </div>
          )}
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            maxWidth: 540,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function MonoInput({
  prefix,
  value,
  placeholder,
  onChange,
}: {
  prefix?: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        border: "1px solid var(--border)",
        background: "var(--bg-2)",
      }}
    >
      {prefix && (
        <span
          className="mono"
          style={{
            padding: "7px 8px",
            color: "var(--text-4)",
            borderRight: "1px solid var(--border)",
            fontSize: 11.5,
          }}
        >
          {prefix}
        </span>
      )}
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mono"
        style={{
          flex: 1,
          border: "none",
          background: "transparent",
          padding: "7px 10px",
          fontSize: 12,
          color: "var(--text)",
          outline: "none",
        }}
      />
    </div>
  );
}

function ModelOption({
  name,
  sub,
  selected,
  onSelect,
}: {
  name: string;
  sub: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      onClick={onSelect}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 12px",
        border: `1px solid ${selected ? "var(--emerald)" : "var(--border)"}`,
        background: selected ? "rgba(16,185,129,0.04)" : "var(--surface)",
        cursor: "pointer",
      }}
    >
      <span
        style={{
          width: 14,
          height: 14,
          borderRadius: "50%",
          border: `1px solid ${selected ? "var(--emerald)" : "var(--border-2)"}`,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {selected && (
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--emerald)",
            }}
          />
        )}
      </span>
      <div style={{ flex: 1 }}>
        <div
          className="mono"
          style={{
            fontSize: 12,
            color: "var(--text)",
            fontWeight: 600,
          }}
        >
          {name}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-4)", marginTop: 1 }}>
          {sub}
        </div>
      </div>
    </label>
  );
}

export function Settings() {
  const cost = useStore((s) => s.cost);
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

  const ceiling = config.costCeilingUsd ?? 25;
  const used = cost.costUsd;
  const usedPct = Math.min(100, (used / ceiling) * 100);

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
        tabLabel="Settings"
        sub={
          savingConfig
            ? "saving…"
            : "caffeine.config.json · auto-saves on change"
        }
      />
      <div style={{ flex: 1, overflow: "auto" }}>
        <Section
          title="Authentication"
          sub="No API key needed. Caffeine uses your local Claude Code OAuth."
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 12px",
              border: "1px solid var(--border)",
              background: "var(--surface)",
            }}
          >
            <span
              className="dot-pulse-emerald"
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--emerald)",
              }}
            />
            <span className="mono" style={{ fontSize: 12, color: "var(--text)" }}>
              connected
            </span>
            <span
              className="mono"
              style={{ fontSize: 11, color: "var(--text-3)" }}
            >
              ~/.claude
            </span>
          </div>
        </Section>

        <Section
          title="Model"
          sub="Default model for new sessions. Pipeline subagents inherit unless overridden."
        >
          {MODELS.map((m) => (
            <ModelOption
              key={m.id}
              name={m.name}
              sub={m.sub}
              selected={(config.model ?? "claude-opus-4-7") === m.id}
              onSelect={() => updateConfig({ ...config, model: m.id })}
            />
          ))}
        </Section>

        <Section
          title="Verification commands"
          sub="Run after edits. Order matters; fast → slow."
        >
          {(["typecheck", "build", "lint", "test"] as const).map((k) => (
            <MonoInput
              key={k}
              prefix={k}
              value={config.verification?.[k] ?? ""}
              placeholder={`pnpm ${k}`}
              onChange={(v) => setVerification(k, v)}
            />
          ))}
        </Section>

        <Section
          title="Cost ceiling"
          sub="Halt the run if total cost exceeds this. Decider iterations have their own ceiling in pipeline.md."
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                border: "1px solid var(--border)",
                background: "var(--bg-2)",
                width: 140,
              }}
            >
              <span
                className="mono"
                style={{
                  padding: "7px 8px",
                  color: "var(--text-4)",
                  borderRight: "1px solid var(--border)",
                  fontSize: 11.5,
                }}
              >
                USD
              </span>
              <input
                type="number"
                min={1}
                step={1}
                value={ceiling}
                onChange={(e) =>
                  updateConfig({
                    ...config,
                    costCeilingUsd: Number(e.target.value) || undefined,
                  })
                }
                className="mono"
                style={{
                  flex: 1,
                  border: "none",
                  background: "transparent",
                  padding: "7px 10px",
                  fontSize: 12,
                  color: "var(--text)",
                  outline: "none",
                  textAlign: "right",
                }}
              />
            </div>
            <div
              style={{
                flex: 1,
                height: 6,
                background: "var(--surface)",
                border: "1px solid var(--border)",
                position: "relative",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${usedPct}%`,
                  background: "var(--emerald)",
                }}
              />
            </div>
            <span
              className="mono"
              style={{ fontSize: 11, color: "var(--text-3)" }}
            >
              ${used.toFixed(2)} used
            </span>
          </div>
        </Section>

        <Section
          title="Claude Code skill"
          sub="The /caffeine skill drafts BACKLOG.md and pipeline.md from your project state."
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 12px",
              border: "1px solid var(--border-2)",
              background: "var(--surface)",
            }}
          >
            <span
              style={{
                width: 26,
                height: 26,
                background: "var(--bg-2)",
                border: "1px solid var(--border)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-3)",
              }}
            >
              <IconBolt size={12} fill="currentColor" />
            </span>
            <div>
              <div
                className="mono"
                style={{
                  fontSize: 12,
                  color: "var(--text)",
                  fontWeight: 600,
                }}
              >
                /caffeine
              </div>
              <div
                className="mono"
                style={{ fontSize: 10.5, color: "var(--text-4)" }}
              >
                ~/.claude/skills/caffeine/SKILL.md
              </div>
            </div>
            <span
              className="mono"
              style={{
                marginLeft: "auto",
                padding: "4px 8px",
                fontSize: 10.5,
                color: "var(--text-3)",
                border: "1px solid var(--border)",
              }}
            >
              installed manually for now
            </span>
          </div>
        </Section>

        <Section title="About" sub="">
          <div
            className="mono"
            style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.7 }}
          >
            <div>
              caffeine{" "}
              <span style={{ color: "var(--text)" }}>v0.0.3</span>
            </div>
            <div>built with electron 41 · react 19 · tailwind 3</div>
            <div>github.com/pavvann/caffeine</div>
          </div>
        </Section>
      </div>
    </div>
  );
}
