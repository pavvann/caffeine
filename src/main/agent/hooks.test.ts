// Regression tests for the v1 Stop hook in `hooks.ts`. These lock in the
// existing behavior before any pipeline-mode changes touch the file.
//
// We don't drive the hook through the SDK — instead we extract the
// registered Stop callback from the result of `buildHooks()` and call it
// directly with a synthetic `Stop` HookInput. The hook ignores the input
// argument anyway, so the synthetic shape only needs to satisfy the type
// system.

import { describe, expect, it, vi, beforeEach } from "vitest";

// `node:fs/promises` is mocked so each test can stage a different
// BACKLOG.md (or none at all), and so the pipeline-mode tests can
// independently control whether `pipeline.md` and the completion
// marker "exist" without touching disk. `readFile` covers BACKLOG.md;
// `access` covers the existence checks for pipeline.md and the marker.
vi.mock("node:fs/promises", () => {
  return {
    readFile: vi.fn(),
    access: vi.fn(),
  };
});

// Electron isn't loadable from a plain node process. The Stop hook itself
// doesn't touch electron, but the surrounding module imports BrowserWindow
// and dialog at the top level for the destructive-bash confirm flow.
vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  dialog: { showMessageBox: vi.fn() },
  ipcMain: { handle: vi.fn() },
}));

// `../ipc` transitively pulls in electron and runtime modules we don't
// need for these tests. Stub `emitSessionEvent` so any hook that fires it
// is a no-op under test.
vi.mock("../ipc", () => ({
  emitSessionEvent: vi.fn(),
  registerIpc: vi.fn(),
  setActiveRepoPath: vi.fn(),
}));

import { readFile, access } from "node:fs/promises";
import { buildHooks, PIPELINE_DONE_MARKER } from "./hooks";
import type {
  HookCallback,
  HookJSONOutput,
  StopHookInput,
} from "@anthropic-ai/claude-agent-sdk";

const REPO_PATH = "/tmp/fake-repo";

function getStopHook(): HookCallback {
  const hooks = buildHooks(REPO_PATH);
  const matchers = hooks.Stop;
  if (!matchers || matchers.length === 0 || matchers[0].hooks.length === 0) {
    throw new Error("Stop hook not registered");
  }
  return matchers[0].hooks[0];
}

function stopInput(): StopHookInput {
  return {
    hook_event_name: "Stop",
    session_id: "test",
    transcript_path: "/tmp/transcript",
    cwd: REPO_PATH,
    stop_hook_active: false,
  } as StopHookInput;
}

async function invokeStop(): Promise<HookJSONOutput> {
  const cb = getStopHook();
  // Stop hook ignores all three arguments; types satisfied for the call site.
  return cb(stopInput(), undefined, { signal: new AbortController().signal });
}

/**
 * For tests that need to call the SAME hook closure multiple times
 * (e.g. fixed-point detector), build hooks once and return a callable
 * that always invokes that same registered Stop callback.
 */
function makePersistentStopInvoker() {
  const hooks = buildHooks(REPO_PATH);
  const cb = hooks.Stop?.[0]?.hooks?.[0];
  if (!cb) throw new Error("Stop hook not registered");
  return (lastAssistantMessage = "") => {
    const input = {
      hook_event_name: "Stop",
      session_id: "test",
      transcript_path: "/tmp/transcript",
      cwd: REPO_PATH,
      stop_hook_active: false,
      last_assistant_message: lastAssistantMessage,
    } as StopHookInput;
    return cb(input, undefined, { signal: new AbortController().signal });
  };
}

/**
 * Configure `access` so `pipeline.md` and/or the completion marker
 * appear "present" or "absent" depending on the test scenario.
 *
 * v1 tests want pipeline.md to be absent — they mock `access` to
 * always reject (ENOENT) so `fileExists` returns false everywhere.
 *
 * Pipeline-mode tests pass an explicit set of "present" filenames.
 */
function stageFilesystem(present: Set<string>): void {
  vi.mocked(access).mockImplementation(async (p) => {
    const path = typeof p === "string" ? p : String(p);
    for (const name of present) {
      if (path.endsWith(name)) return;
    }
    const err = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    throw err;
  });
}

describe("Stop hook (v1 regression)", () => {
  beforeEach(() => {
    vi.mocked(readFile).mockReset();
    vi.mocked(access).mockReset();
    // v1 default: pipeline.md is absent, so the pipeline branch is
    // never entered.
    stageFilesystem(new Set());
  });

  it("blocks when BACKLOG.md still has unchecked items", async () => {
    vi.mocked(readFile).mockResolvedValueOnce(
      [
        "# Backlog",
        "",
        "- [x] done item",
        "- [ ] still open",
        "- [ ] another open",
      ].join("\n"),
    );

    const result = await invokeStop();

    expect(result).toMatchObject({ decision: "block" });
    expect((result as { reason?: string }).reason).toMatch(/2 unchecked/);
  });

  it("returns {} when BACKLOG.md has only checked items", async () => {
    vi.mocked(readFile).mockResolvedValueOnce(
      [
        "# Backlog",
        "",
        "- [x] one done",
        "- [x] two done",
      ].join("\n"),
    );

    const result = await invokeStop();

    expect(result).toEqual({});
  });

  it("returns {} when BACKLOG.md does not exist (readFile throws)", async () => {
    const enoent = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    vi.mocked(readFile).mockRejectedValueOnce(enoent);

    const result = await invokeStop();

    expect(result).toEqual({});
  });

  it("does not count indented `- [ ] AC:` rows as open backlog tasks", async () => {
    // Indented AC checkboxes are acceptance criteria belonging to a
    // (checked) task — they're task details, not standalone work
    // items. Counting them would block the stop forever even when
    // every top-level task is done, defeating the close-protocol.
    vi.mocked(readFile).mockResolvedValueOnce(
      [
        "# Backlog",
        "",
        "- [x] Build feature",
        "  - [ ] AC: this AC was left unchecked but the task is done",
        "  - [x] AC: this one is checked",
      ].join("\n"),
    );

    const result = await invokeStop();

    expect(result).toEqual({});
  });

  it("counts only the top-level unchecked task, not its unchecked ACs", async () => {
    vi.mocked(readFile).mockResolvedValueOnce(
      [
        "- [ ] One task with three ACs",
        "  - [ ] AC: a",
        "  - [ ] AC: b",
        "  - [ ] AC: c",
      ].join("\n"),
    );

    const result = await invokeStop();

    expect(result).toMatchObject({ decision: "block" });
    // Reason text says "1 unchecked task" — not 4. If this fails with
    // /4 unchecked/, the count regex is matching the indented ACs too.
    expect((result as { reason: string }).reason).toMatch(/1 unchecked/);
  });
});

describe("Stop hook (pipeline mode)", () => {
  beforeEach(() => {
    vi.mocked(readFile).mockReset();
    vi.mocked(access).mockReset();
  });

  it("(d) pipeline mode + unchecked items → blocks (v1 reason)", async () => {
    stageFilesystem(new Set(["pipeline.md"]));
    vi.mocked(readFile).mockResolvedValueOnce(
      "# Backlog\n\n- [ ] open\n",
    );

    const result = await invokeStop();

    expect(result).toMatchObject({ decision: "block" });
    expect((result as { reason: string }).reason).toMatch(/unchecked task/);
  });

  it("(e) pipeline mode + empty backlog + on_backlog_complete pending → blocks with new reason", async () => {
    // pipeline.md present; completion marker absent.
    stageFilesystem(new Set(["pipeline.md"]));
    vi.mocked(readFile).mockResolvedValueOnce(
      "# Backlog\n\n- [x] all done\n",
    );

    const result = await invokeStop();

    expect(result).toMatchObject({ decision: "block" });
    // Loose match — pin only the load-bearing keyword
    // (`on_backlog_complete`) so future copy-edits to the user-facing
    // string don't break the test.
    expect((result as { reason: string }).reason).toMatch(
      /on_backlog_complete/i,
    );
  });

  it("(f) pipeline mode + everything done (marker present) → returns {}", async () => {
    stageFilesystem(new Set(["pipeline.md", PIPELINE_DONE_MARKER]));
    vi.mocked(readFile).mockResolvedValueOnce(
      "# Backlog\n\n- [x] all done\n",
    );

    const result = await invokeStop();

    expect(result).toEqual({});
  });
});

describe("Stop hook (fixed-point detector)", () => {
  beforeEach(() => {
    vi.mocked(readFile).mockReset();
    vi.mocked(access).mockReset();
    stageFilesystem(new Set());
  });

  it("blocks twice on identical state, then allows the stop on the third try", async () => {
    // Same BACKLOG content + same final assistant message across three
    // consecutive Stop invocations. Models the "Awaiting your input."
    // spam loop: agent has correctly identified that remaining tasks
    // are external blockers and keeps trying to stop with the same
    // message, but the original hook would have blocked forever.
    const backlog = "# Backlog\n\n- [ ] external blocker A\n- [ ] external blocker B\n";
    vi.mocked(readFile).mockResolvedValue(backlog);

    const stop = makePersistentStopInvoker();
    const STUCK = "Awaiting your input.";

    const r1 = await stop(STUCK);
    expect(r1).toMatchObject({ decision: "block" });

    const r2 = await stop(STUCK);
    expect(r2).toMatchObject({ decision: "block" });

    const r3 = await stop(STUCK);
    expect(r3).toEqual({});
  });

  it("resets the stuck counter when BACKLOG.md changes (real progress)", async () => {
    // First two stops on signature A, then BACKLOG mutates (a task
    // got checked), then a third stop on signature B. The change
    // should reset the counter — third stop blocks normally because
    // it's a new signature, not the third strike on the old one.
    vi.mocked(readFile)
      .mockResolvedValueOnce("# Backlog\n- [ ] one\n- [ ] two\n")
      .mockResolvedValueOnce("# Backlog\n- [ ] one\n- [ ] two\n")
      .mockResolvedValueOnce("# Backlog\n- [x] one\n- [ ] two\n"); // task one now checked

    const stop = makePersistentStopInvoker();

    const r1 = await stop("stuck");
    const r2 = await stop("stuck");
    const r3 = await stop("stuck");

    expect(r1).toMatchObject({ decision: "block" });
    expect(r2).toMatchObject({ decision: "block" });
    // Third call has a different BACKLOG signature → counter resets,
    // hook blocks normally (rather than returning {} as a fixed-point).
    expect(r3).toMatchObject({ decision: "block" });
  });

  it("resets the stuck counter when the agent's final message changes", async () => {
    // BACKLOG stays put but the agent's final message changes — that
    // counts as progress (the agent is reasoning, not just spamming).
    const backlog = "# Backlog\n- [ ] open\n";
    vi.mocked(readFile).mockResolvedValue(backlog);

    const stop = makePersistentStopInvoker();

    await stop("first attempt");
    await stop("first attempt"); // stuckCount = 2 on signature A
    const r3 = await stop("different reasoning here"); // signature changes
    expect(r3).toMatchObject({ decision: "block" });

    // Two more on the new signature would block, three would release.
    const r4 = await stop("different reasoning here");
    const r5 = await stop("different reasoning here");
    expect(r4).toMatchObject({ decision: "block" });
    expect(r5).toEqual({});
  });
});
