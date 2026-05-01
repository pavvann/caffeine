---
per_task:
  - reviewer
  - security
  - tester
on_backlog_complete:
  - run: pnpm typecheck
  - run: pnpm build
  - run: pnpm test
decider:
  max_iterations: 3
  cost_ceiling_per_iteration_usd: 5
---

# Caffeine pipeline

This file is the source of truth for how Caffeine runs its own backlog
in pipeline mode. The YAML frontmatter above is parsed by
`src/main/pipeline/parser.ts`. Everything below this line is rationale
for humans (and for the agent that reads this file before drafting a
new pipeline elsewhere).

## per_task — runs for each unchecked BACKLOG.md item

Three subagents run in order after the implementer (the main agent)
finishes a task. Each one writes its findings to STATE.md so the
parent thread's context stays clean.

1. **reviewer** — adversarial diff critique. Looks for missed edge
   cases, broken invariants, suspicious shortcuts. Read-only, reports
   to STATE.md. Defined in `src/main/agent/reviewer.ts`.

2. **security** — secrets, injection sinks, missing authz, unsafe
   deserialization, XSS. Bash-enabled so it can run `gitleaks` if
   it's on PATH. Reports to STATE.md under `## Security Findings`.
   Defined in `src/main/agent/security-agent.ts`.

3. **tester** — writes/updates tests for the changed files in the
   diff and runs `pnpm test` to confirm they pass before exiting.
   Reports to STATE.md under `## Test Findings`. Defined in
   `src/main/agent/tester-agent.ts`.

The order matters: `reviewer` runs first because its findings inform
the security and tester passes. Adding a fourth stage (e.g. `linter`,
`docs`) is a five-line PR — drop a new `AgentDefinition` in
`src/main/agent/`, register it in `src/main/agent/runner.ts:115`,
add the name here.

## on_backlog_complete — runs once after the whole backlog drains

Three integration gates. The first non-zero exit code is what reaches
the decider; subsequent commands still run so failures are reported
together rather than one-at-a-time.

- `pnpm typecheck` — both `tsconfig.node.json` and `tsconfig.web.json`
- `pnpm build` — full electron-vite build of main + preload + renderer
- `pnpm test` — vitest run, currently 41 tests across 6 files

Order is fast-to-slow on purpose. typecheck is the cheapest gate; if
it fails the loop catches it before paying for the build.

## decider — agent-driven loop control

`decider.max_iterations: 3` caps the loop at three iterations. If
iteration 3 still has a non-zero exit code, the decider returns
`halt` and the session ends with the failures surfaced to the user.

`decider.cost_ceiling_per_iteration_usd: 5` is a per-iteration USD
budget. With Opus 4.7 across 4 stages × ~10 backlog items, $5 leaves
comfortable headroom. Tighten this if you're running on Sonnet
(cheaper) or loosen it if backlogs grow large.

The decider itself is an agent — `src/main/agent/decider-agent.ts`.
It reads STATE.md, the staged diff, and the failed commands, then
writes a structured JSON block back to STATE.md. When it returns
`loop`, it authors the `[LOOP-N]` task descriptions itself rather
than the orchestrator dumping raw exit-code lines into BACKLOG.md.

## Why this is a DCG, not a DAG

Most workflow engines (LangGraph, GitHub Actions) are DAGs — directed
acyclic graphs. Forward flow only.

This pipeline has a back-edge: `decider → loop → top of backlog`.
That cycle, combined with the conditional output of the decider
(`done` / `loop` / `halt`), makes this a **directed cyclic graph
with conditional edges**. The cycles are the differentiator. Without
them, this would be plan mode with a fancy UI.

## How to modify this pipeline

Edit the YAML frontmatter above. The renderer's Pipeline tab will pick
up the new shape on next mount. Stages must be names already
registered in `runner.ts` (`reviewer`, `security`, `tester`,
`decider`). To add a stage, see the five-line PR note above.
