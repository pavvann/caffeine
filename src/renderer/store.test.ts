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
