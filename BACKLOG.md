# Caffeine v2 — Pipeline Mode

This is the backlog Caffeine v1 will work through to build Caffeine v2.

**Meta-context for the agent:** You are Caffeine v1, an Electron app that runs long Claude Code sessions through a backlog of tasks. You are about to extend yourself into v2, which adds multi-agent pipelines on top of the existing single-agent runner. Read `src/main/agent/runner.ts`, `src/main/agent/hooks.ts`, `src/main/agent/reviewer.ts`, `src/main/agent/promptBus.ts`, and `src/shared/types.ts` first to understand what already exists. Then read this entire backlog top to bottom before starting task #1, so you understand the full arc and don't break load-bearing code in early tasks.

**Architecture decisions already locked (do not relitigate):**
- Subagent findings go to STATE.md, not back to the parent thread
- Decider appends `[LOOP-N] <task>` items to BACKLOG.md
- pipeline.md uses YAML frontmatter for structured config + markdown body for rationale
- v1 behavior must keep working when no pipeline.md exists (regression net is task #2)

**Order matters.** Tasks 1-2 are the safety net. Do not touch the Stop hook or runner until task #2 exists and passes. Tasks 3-9 are new files with no v1 risk. Tasks 10-13 modify load-bearing v1 code and must be done in order.

After every meaningful edit, run the verification commands in `caffeine.config.json`. After every task, invoke the `reviewer` subagent on the diff before marking the box checked.

---

## Phase 0: Safety net

- [ ] Add `vitest` and `@vitest/ui` as devDependencies. Create `vitest.config.ts` at the repo root with a `node` environment and globs `src/**/*.test.ts`. Add scripts to `package.json`: `"test": "vitest run"` and `"test:watch": "vitest"`. Update `caffeine.config.json` to include `"test": "pnpm test"` under `verification`. Verify by running `pnpm test` and confirming it exits cleanly with "no tests found."

- [ ] **CRITICAL REGRESSION TEST.** Write `src/main/agent/hooks.test.ts` covering the existing v1 Stop hook behavior in `src/main/agent/hooks.ts`. Use `vitest`'s `vi.mock` to mock `node:fs/promises` `readFile`. Three test cases: (a) BACKLOG.md has unchecked items → Stop hook returns `{decision: "block", reason: ...}`, (b) BACKLOG.md has only checked items → returns `{}`, (c) BACKLOG.md does not exist → returns `{}` (the catch in `countOpenBacklogItems`). Do not modify `hooks.ts` itself in this task. Confirm tests pass.

## Phase 1: New surface area (no v1 risk)

- [ ] Create `src/main/pipeline/types.ts` exporting a `Pipeline` type with fields: `per_task: string[]` (stage agent names), `on_backlog_complete: { run: string }[]` (shell commands), `decider: { max_iterations: number; cost_ceiling_per_iteration_usd?: number }`. Also export a `parsedPipelineFromFrontmatter` helper signature (implementation in next task).

- [ ] Create `src/main/pipeline/parser.ts` exporting `async function readPipeline(repoPath: string): Promise<Pipeline | null>`. Reads `<repoPath>/pipeline.md`. Returns null if file missing. Parses YAML frontmatter (between `---` markers) into the `Pipeline` type. Throws a clearly-typed `PipelineParseError` for malformed YAML or missing required fields. Use the existing `js-yaml` ecosystem if available, or a minimal hand-rolled parser if not (frontmatter is small, hand-rolling is fine). Ignore the markdown body.

- [ ] Write `src/main/pipeline/parser.test.ts` with five cases: (a) valid frontmatter → returns Pipeline, (b) missing pipeline.md → returns null, (c) missing `per_task` field → throws PipelineParseError with clear message, (d) malformed YAML → throws PipelineParseError, (e) `decider.max_iterations` is a string instead of number → throws PipelineParseError. Use vitest's `tmpdir` pattern or `memfs` for fixtures.

- [ ] Create `src/main/pipeline/decider.ts` exporting `function decide(args: { e2eExitCode: number; currentIteration: number; maxIterations: number }): "done" | "loop" | "halt"`. Logic: exit 0 → "done"; non-zero AND currentIteration < maxIterations → "loop"; non-zero AND currentIteration >= maxIterations → "halt". Pure function, no side effects.

- [ ] Write `src/main/pipeline/decider.test.ts` with four cases mirroring the four logical branches. Pure unit tests, no mocks needed.

## Phase 2: Stage agent definitions (new files, no v1 risk)

- [ ] Create `src/main/agent/security-agent.ts` exporting `SECURITY_AGENT: AgentDefinition`. Prompt: adversarial security reviewer. Inspects the staged diff (via `git diff --staged`) for: leaked secrets/API keys, SQL injection, command injection, unsafe deserialization, missing authz checks, XSS sinks. Tools: `["Read", "Grep", "Glob", "Bash"]`. Bash is for running `gitleaks` or `git diff` if available. Final action: append findings to `STATE.md` under a `## Security Findings` section. Reports only — does not edit code.

- [ ] Create `src/main/agent/tester-agent.ts` exporting `TESTER_AGENT: AgentDefinition`. Prompt: writes or updates tests for code changed in the current diff. Reads `git diff --staged` to identify changed files. Writes test files matching project conventions (e.g., `foo.ts` → `foo.test.ts`). Tools: `["Read", "Edit", "Write", "Glob", "Grep", "Bash"]`. Final action: appends findings (which tests added/updated) to `STATE.md` under `## Test Findings`. Runs `pnpm test` to confirm new tests pass before exiting.

## Phase 3: Orchestrator (extends load-bearing v1 code)

- [ ] Create `src/main/pipeline/orchestrator.ts` exporting `async function runPipeline(pipeline: Pipeline, repoPath: string, bus: PromptBus, query: Query): Promise<void>`. Walks per-task stages for each unchecked BACKLOG item by pushing `Run the <stageName> stage on the current task` messages onto the bus. After all tasks done, runs each `on_backlog_complete[i].run` command via `child_process.spawn`, captures exit code. Calls `decide()` with the e2e exit code and iteration counter. On `"loop"`, appends `[LOOP-N] <failure-summary>` tasks to BACKLOG.md via `appendLoopTasks` (next task) and continues. On `"done"` or `"halt"`, returns.

- [ ] Extend `src/main/repo/backlog.ts` with `async function appendLoopTasks(repoPath: string, iteration: number, failures: string[]): Promise<void>`. Appends one `- [ ] [LOOP-<iteration>] <failure>` line per failure. Idempotent (if the same failure already exists, do not duplicate). Add unit tests in `src/main/repo/backlog.test.ts`.

- [ ] Write `src/main/pipeline/orchestrator.test.ts` with three integration cases using mocked stage agents (no real LLM calls): (a) happy path 2-task pipeline with all stages succeeding → BACKLOG fully checked, decider returns done, (b) one stage agent throws → orchestrator surfaces error and halts current task, moves on or stops based on policy, (c) decider returns "loop" → BACKLOG.md is mutated with `[LOOP-1]` task and second iteration runs. Mock the SDK by stubbing the `query` and `bus.push` calls.

- [ ] Extend `src/main/agent/hooks.ts` Stop hook. Detect pipeline mode by checking if `pipeline.md` exists in `targetRepoPath`. In pipeline mode: when BACKLOG.md is empty, return `{decision: "block", reason: "Backlog complete, run on_backlog_complete stages"}` so the orchestrator picks up. Outside pipeline mode: preserve existing behavior exactly. Add three new test cases to `hooks.test.ts`: (d) pipeline mode + unchecked items → blocks, (e) pipeline mode + empty backlog + on_backlog_complete pending → blocks with the new reason, (f) pipeline mode + everything done → returns `{}`.

- [ ] Extend `src/main/agent/runner.ts`. At session start, call `readPipeline(args.targetRepoPath)`. If a pipeline is returned, store it on the session and pass it to `runPipeline()` after the agent SDK loop kicks off. If null, preserve v1 single-agent behavior. Wire `runPipeline` to use the existing `bus` and `query` handles. Do not break the existing `STUB_QUERY` lazy-resolution pattern.

## Phase 4: IPC + minimal UI

- [ ] Extend `src/shared/types.ts` with new SessionEvent variants: `PipelineStartedEvent { kind: "pipeline-started"; pipeline: Pipeline }`, `StageStartedEvent { kind: "stage-started"; taskIndex: number; stageName: string }`, `StageCompletedEvent { kind: "stage-completed"; taskIndex: number; stageName: string; durationMs: number }`, `IterationStartedEvent { kind: "iteration-started"; iteration: number }`, `IterationDecidedEvent { kind: "iteration-decided"; iteration: number; decision: "done" | "loop" | "halt" }`. Update the `SessionEvent` union. Update the orchestrator to emit these events via the existing `emitSessionEvent` helper.

- [ ] Update `src/renderer/store.ts` to handle the new event types. Add fields to the store: `currentPipeline: Pipeline | null`, `currentTaskIndex: number`, `currentStage: string | null`, `currentIteration: number`. Update `ingest()` to set these from the new events.

- [ ] Update `src/renderer/views/Session.tsx` status bar to display, when in pipeline mode: `Task <index>/<total> · <stageName> · iteration <N>`. Outside pipeline mode, preserve current display.

## Phase 5: Validation

- [ ] Run `pnpm typecheck` and `pnpm build`. Both must pass cleanly. If either fails, fix before marking this task done.

- [ ] Run `pnpm test`. All tests must pass. Confirm the v1 hooks regression tests (the originals from task #2) still pass alongside the new pipeline ones.

- [ ] Append a `## v0.0.2 — Pipeline Mode` section to `CHANGELOG.md` (create the file if it does not exist) summarizing: pipeline.md format with YAML frontmatter, per_task stages with security and tester subagents, decider with max_iterations and loop-back, BACKLOG.md `[LOOP-N]` annotation. Bump `package.json` version to `0.0.2`.
