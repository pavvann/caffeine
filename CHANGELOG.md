# Changelog

## v0.0.3 — Agentic Decider

The pipeline's loop-control decider is now an agent, not a pure
function. At the end of every iteration the orchestrator pushes a
prompt asking the main agent to invoke the new `decider` subagent.
The decider reads STATE.md, the diff, and the e2e failures, then
writes a structured JSON block to STATE.md with its decision and (when
looping) targeted `[LOOP-N]` task descriptions.

### Added

- **`DECIDER_AGENT`** (`src/main/agent/decider-agent.ts`).
  Read-only subagent. Reads STATE.md and the staged diff, decides
  done/loop/halt, and writes a JSON code block under `## Decider
  Output: Iteration N` in STATE.md.

- **`requestAgenticDecision()`** (`src/main/pipeline/decider.ts`).
  Pushes the iteration-end prompt onto the bus, polls STATE.md until
  the decider's structured output appears, then returns it. Falls back
  to the pure `decide()` on timeout (5 min default) or abort, so the
  loop always terminates.

- **`parseDeciderOutput()`** (`src/main/pipeline/decider.ts`).
  Defensively parses the agent's JSON block. Validates `decision`,
  filters non-string `loop_tasks`, drops empty arrays, and rejects
  prefix-collisions on the iteration heading
  (`Iteration 1` vs `Iteration 10`).

- **Targeted `[LOOP-N]` tasks.** When the decider supplies
  `loop_tasks`, the orchestrator appends those instead of raw
  failure summaries. Each loop_task is one specific actionable
  instruction with file:line, written by the agent based on what
  actually failed.

- **`requestDecision` DI hook** on `RunPipelineOptions`. Tests inject
  a synchronous stub that bypasses the bus + STATE.md round trip.
  Production wires the agentic flow.

### Changed

- `decide()` is unchanged (still a pure function) but is now used
  only as the deterministic fallback when the agentic flow times out
  or aborts. The orchestrator's primary path is `requestDecision()`.

### Tests

- `decider-output.test.ts` — 9 cases for the structured-output parser
  including the heading prefix-collision regression.
- `orchestrator.test.ts` — added one case for the targeted-loop_tasks
  override of raw failure summaries. All prior cases keep their
  semantics by injecting a deterministic `requestDecision` stub.
- Full suite: **41/41 passing**.

### Compatibility

The pure `decide()` API is unchanged. Pipelines without a `pipeline.md`
still get v1 single-agent behavior. Pipelines with a `pipeline.md` now
get richer loop-back tasks; if the decider agent fails or times out,
behavior is identical to v0.0.2 (raw exit-code summaries appended to
BACKLOG.md).

## v0.0.2 — Pipeline Mode

Caffeine v2 introduces multi-agent pipeline mode on top of the existing
single-agent runner. Pipeline mode is opt-in: drop a `pipeline.md` at
the root of your target repo and Caffeine will engage the orchestrator
on the next session start. If no `pipeline.md` is present, v1 behavior
is preserved exactly.

### Added

- **`pipeline.md` format.** A small YAML frontmatter at the top of the
  file declares the pipeline. Markdown body is rationale for humans and
  is ignored by the parser.

  ```yaml
  ---
  per_task:
    - reviewer
    - security
    - tester
  on_backlog_complete:
    - run: pnpm test
    - run: pnpm e2e
  decider:
    max_iterations: 3
    cost_ceiling_per_iteration_usd: 5
  ---
  ```

- **`per_task` stages.** For every unchecked BACKLOG.md item, the
  orchestrator queues each stage subagent (`reviewer`, `security`,
  `tester`) onto the agent's prompt bus. Stage findings are appended
  to STATE.md so the parent thread's context stays clean.

- **Security and tester stage agents.** Two new `AgentDefinition`s
  ship out of the box: `SECURITY_AGENT` (read-only adversarial
  security review) and `TESTER_AGENT` (writes/updates tests for the
  current diff and confirms with `pnpm test`).

- **Decider with `max_iterations` and loop-back.** After every
  iteration runs the `on_backlog_complete` commands, the orchestrator
  feeds the final exit code to `decide()`:
  - exit 0 → `done` (session terminates cleanly)
  - non-zero with iterations remaining → `loop`
  - non-zero at the iteration cap → `halt`

- **`[LOOP-N]` BACKLOG.md annotation.** When `decide()` returns
  `"loop"`, the orchestrator appends one
  `- [ ] [LOOP-<iteration>] <failure>` line per failed
  `on_backlog_complete` command. Idempotent across iterations.

- **Pipeline-mode Stop hook.** The runner's Stop hook now keeps the
  agent alive while `pipeline.md` is present until the orchestrator
  drops a `.caffeine-pipeline-complete` marker. Outside pipeline mode
  the v1 stop behavior is preserved verbatim.

- **IPC events.** `pipeline-started`, `iteration-started`,
  `stage-started`, `iteration-decided`. The renderer's StatusBar
  surfaces `Task <index>/<total> · <stageName> · iteration <N>` in
  pipeline mode and prints `halted (max iterations)` if the decider
  bails out.

### Internals

- New module: `src/main/pipeline/` — types, parser, decider,
  orchestrator.
- New tests: `parser.test.ts` (5 cases), `decider.test.ts` (4 cases),
  `orchestrator.test.ts` (7 cases), `backlog.test.ts` (8 cases),
  `hooks.test.ts` (6 cases — 3 v1 regression + 3 pipeline mode).
- Vitest installed as the project's test runner; `pnpm test` is now a
  verification command in `caffeine.config.json`.

### Compatibility

When no `pipeline.md` exists, v1 single-agent behavior is unchanged.
The Stop hook, runner, and renderer all preserve the v1 paths exactly;
the regression suite locks them in.

## v0.0.1 — Initial release

The single-agent runner. Long-running Claude Code sessions, controlled.
