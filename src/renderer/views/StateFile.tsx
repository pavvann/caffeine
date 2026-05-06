import { useEffect, useState } from "react";
import { useStore } from "../store";
import { MarkdownView } from "../components/MarkdownView";
import { SegToggle, StatusBar } from "../components/StatusBar";

type Mode = "read" | "raw";

export function StateFile() {
  const stateFile = useStore((s) => s.stateFile);
  const [mode, setMode] = useState<Mode>("read");

  useEffect(() => {
    void window.caffeine.state.read().then((content: string) => {
      if (!content) return;
      useStore.getState().ingest({ kind: "state-file", content });
    });
  }, []);

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
        tabLabel="STATE.md"
        sub="live · agent-written"
        right={
          <>
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                color: "var(--text-4)",
                fontSize: 11,
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
              <span className="mono">read-only</span>
            </span>
            <SegToggle value={mode} onChange={setMode} options={["read", "raw"]} />
          </>
        }
      />
      {!stateFile ? (
        <div
          style={{
            flex: 1,
            display: "grid",
            placeItems: "center",
            color: "var(--text-3)",
            fontSize: 13,
            padding: "0 24px",
            textAlign: "center",
          }}
        >
          STATE.md is empty or not yet created.
          <br />
          The agent writes it on the first turn.
        </div>
      ) : mode === "read" ? (
        <MarkdownView content={stateFile} />
      ) : (
        <pre
          className="mono"
          style={{
            flex: 1,
            margin: 0,
            padding: "16px 20px",
            fontSize: 12,
            lineHeight: 1.6,
            color: "var(--text-2)",
            overflow: "auto",
            whiteSpace: "pre-wrap",
            background: "#0a0a0d",
          }}
        >
          {stateFile}
        </pre>
      )}
    </div>
  );
}
