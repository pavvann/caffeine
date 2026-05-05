// Tests for the renderer store's event-handling discipline.
//
// These exist specifically because of the "currentStage stuck on the
// last queued stage" bug: every individual ingest case did what its
// author intended, every node component faithfully rendered the field
// it was given, and yet the user saw the wrong thing. The bug lived
// in the contract between the orchestrator's event-emission timing
// and the store's interpretation of those events.
//
// The pattern this guards against: a "current X" field that gets set
// by event A but never cleared, so it always reports the *last* X
// rather than the *currently active* X. Whenever you add a field
// labelled current/active/running/last, write the absence test here
// so the field can't silently go stale.

import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "./store";

beforeEach(() => {
  // Reset the global store so tests don't leak state into each other.
  useStore.getState().reset();
});

describe("store.ingest — pipeline event semantics", () => {
  it("does not set currentStage from stage-started events (queue-time, not run-time)", () => {
    // The orchestrator pushes all per_task stage prompts onto the bus
    // in a tight loop and emits stage-started for each one before any
    // of them has actually run. If the store treated stage-started as
    // "this stage is running now," currentStage would settle on the
    // last queued stage and the UI would highlight the wrong node.
    expect(useStore.getState().currentStage).toBeNull();

    useStore.getState().ingest({
      kind: "stage-started",
      taskIndex: 1,
      taskTotal: 1,
      stageName: "reviewer",
    });
    useStore.getState().ingest({
      kind: "stage-started",
      taskIndex: 1,
      taskTotal: 1,
      stageName: "security",
    });
    useStore.getState().ingest({
      kind: "stage-started",
      taskIndex: 1,
      taskTotal: 1,
      stageName: "tester",
    });

    expect(useStore.getState().currentStage).toBeNull();
    // Task counters DO update from stage-started — that's the part
    // that's correct at queue-time.
    expect(useStore.getState().currentTaskIndex).toBe(1);
    expect(useStore.getState().currentTaskTotal).toBe(1);
  });

  it("sets currentStage only from subagent-state (actual run timing)", () => {
    useStore.getState().ingest({ kind: "subagent-state", running: "reviewer" });
    expect(useStore.getState().currentStage).toBe("reviewer");

    useStore.getState().ingest({ kind: "subagent-state", running: "security" });
    expect(useStore.getState().currentStage).toBe("security");
  });

  it("clears currentStage when subagent-state reports null (between stages)", () => {
    useStore.getState().ingest({ kind: "subagent-state", running: "reviewer" });
    expect(useStore.getState().currentStage).toBe("reviewer");

    useStore.getState().ingest({ kind: "subagent-state", running: null });
    // The absence test. This is the assertion that fails the original
    // bug: the field has to drop back to null when the subagent ends,
    // not stay pinned to the last value forever.
    expect(useStore.getState().currentStage).toBeNull();
  });

  it("clears currentStage on transition into running status (fresh session boundary)", () => {
    useStore.getState().ingest({ kind: "subagent-state", running: "tester" });
    expect(useStore.getState().currentStage).toBe("tester");

    useStore
      .getState()
      .ingest({ kind: "status", status: "running", at: Date.now() });

    // A new run shouldn't inherit stale stage state from the previous run.
    expect(useStore.getState().currentStage).toBeNull();
    expect(useStore.getState().currentTaskIndex).toBe(-1);
    expect(useStore.getState().currentIteration).toBe(0);
    expect(useStore.getState().lastDecision).toBeNull();
  });

  it("clears currentStage on reset()", () => {
    useStore.getState().ingest({ kind: "subagent-state", running: "decider" });
    expect(useStore.getState().currentStage).toBe("decider");

    useStore.getState().reset();
    expect(useStore.getState().currentStage).toBeNull();
  });
});

describe("store.hydrateHistory — transcript replay from persisted events", () => {
  it("replays assistant-text and tool events into rows", () => {
    useStore.getState().hydrateHistory([
      {
        kind: "tool-call",
        id: "t1",
        name: "Read",
        input: { file_path: "/x" },
        startedAt: 1000,
      },
      {
        kind: "tool-result",
        id: "t1",
        output: "ok",
        isError: false,
        finishedAt: 1100,
      },
      { kind: "assistant-text", id: "a1", text: "hello", at: 1200 },
    ]);
    const rows = useStore.getState().rows;
    expect(rows).toHaveLength(2);
    // tool-call + tool-result get merged into a single tool row
    expect(rows[0]).toMatchObject({ kind: "tool", id: "t1", status: "done" });
    expect(rows[1]).toMatchObject({ kind: "text", text: "hello" });
  });

  it("skips status events during hydration (lifecycle is not historical state)", () => {
    useStore.getState().hydrateHistory([
      { kind: "status", status: "running", at: 1000 },
      { kind: "status", status: "error", reason: "old failure", at: 2000 },
    ]);
    // Status should NOT be set from replay — the live session (or
    // absence of one) decides current status, not history.
    expect(useStore.getState().status).toBe("idle");
    expect(useStore.getState().statusReason).toBeNull();
  });

  it("skips subagent-state events during hydration (live-only highlight)", () => {
    useStore.getState().hydrateHistory([
      { kind: "subagent-state", running: "reviewer" },
      { kind: "subagent-state", running: "security" },
    ]);
    // currentStage describes a *running* subagent; history shouldn't
    // pin it to whatever was running last time.
    expect(useStore.getState().currentStage).toBeNull();
  });

  it("resets rows/cost/state-file before replaying so reopening a project doesn't accumulate", () => {
    // Pollute the store as if we had a session running
    useStore.getState().ingest({
      kind: "tool-call",
      id: "stale",
      name: "Read",
      input: {},
      startedAt: 1,
    });
    useStore.getState().ingest({
      kind: "cost",
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      costUsd: 1.5,
    });
    expect(useStore.getState().rows).toHaveLength(1);
    expect(useStore.getState().cost.costUsd).toBeCloseTo(1.5);

    // Hydrate with a different (smaller) history
    useStore.getState().hydrateHistory([
      { kind: "assistant-text", id: "a1", text: "fresh", at: 100 },
    ]);

    // Stale tool row is gone; cost is reset before replaying
    expect(useStore.getState().rows).toHaveLength(1);
    expect(useStore.getState().rows[0]).toMatchObject({ text: "fresh" });
    expect(useStore.getState().cost.costUsd).toBeCloseTo(0);
  });

  it("replays cost events cumulatively (matches live behavior)", () => {
    useStore.getState().hydrateHistory([
      {
        kind: "cost",
        inputTokens: 10,
        outputTokens: 5,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        costUsd: 0.25,
      },
      {
        kind: "cost",
        inputTokens: 20,
        outputTokens: 10,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        costUsd: 0.5,
      },
    ]);
    // Costs are per-turn deltas in the wire shape; the store sums them.
    expect(useStore.getState().cost.costUsd).toBeCloseTo(0.75);
  });

  it("replays state-file events to the latest content", () => {
    useStore.getState().hydrateHistory([
      { kind: "state-file", content: "## Old" },
      { kind: "state-file", content: "## Current Task\n\nrunning" },
    ]);
    expect(useStore.getState().stateFile).toContain("running");
  });

  it("preserves project and view across hydration (it's a transcript replay, not a context switch)", () => {
    useStore.getState().setProject({
      id: "p1",
      name: "demo",
      path: "/x",
      lastSessionId: null,
      lastOpenedAt: 0,
    });
    useStore.getState().setView("backlog");
    useStore.getState().hydrateHistory([]);
    expect(useStore.getState().project?.id).toBe("p1");
    expect(useStore.getState().view).toBe("backlog");
  });
});
