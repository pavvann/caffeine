# Caffeine

> Long-running Claude agent sessions, controlled.

Caffeine points Claude at a backlog of tasks and lets it work through them autonomously — for hours, on real engineering work. The agent runs while you sleep. It produces output you can verify against an explicit contract, or it tells you why it couldn't.

The product is built around four ideas:

1. **Markdown files in your repo are the durable working memory.** A `BACKLOG.md` plus a `STATE.md` plus a stubborn Stop hook keeps the agent on task across context compaction, restarts, and 4am hours.
2. **Every task has explicit acceptance criteria.** Each task in `BACKLOG.md` carries 2–5 indented `- [ ] AC: ...` rows. ACs are the contract — observable behaviors a reviewer can verify against the diff, not implementation steps.
3. **An independent critic judges fit-to-intent.** Tests written by the same agent that wrote the code only prove the agent agreed with itself. The `critic` subagent reads the original task + its ACs + the staged diff and renders a per-AC verdict. Without this, "tests pass" stops being trustworthy signal.
4. **A decider loops the agent back on failure with targeted next-step tasks.** When integration breaks or the critic flags an unmet AC, the decider authors specific follow-up work and the agent runs another iteration. The cycle plus conditional outputs (`done` / `loop` / `halt`) is what makes Caffeine a Directed Cyclic Graph with conditional edges, not a DAG.

## What you get

- Sequential agent mode that walks `BACKLOG.md` checkbox-by-checkbox, with an adversarial reviewer subagent gating each task.
- Pipeline mode (opt-in) that adds security, tester, and critic subagents per task, integration commands after the backlog drains, and an agentic decider that loops back on failure with targeted next-step tasks.
- Per-task **acceptance criteria** as nested checkboxes — the implementer ticks them as evidence accrues, the critic verifies them against the diff.
- A live-rendered DCG view of your pipeline with drag-and-drop reordering of stages and a curved feedback arc that lights up on `loop`.
- A `/caffeine` Claude Code skill that drafts your `BACKLOG.md` (with ACs) and `pipeline.md` for you so you don't have to author them by hand.
- Custom stages as drop-in `agents/<name>.md` markdown files in your repo — no code needed. User files override bundled ones on name conflict.
- Session transcripts persisted to disk, so quitting and reopening doesn't lose your history.

## How it works

Four files live in your target repo. Caffeine reads and writes them, the agent reads them, you read them. Plain markdown and YAML, all git-trackable.

| File | Owner | Purpose |
|---|---|---|
| `BACKLOG.md` | You + agent | The plan. Top-level checkbox tasks with indented `- [ ] AC: ...` rows underneath. Agent ticks ACs as evidence, then the parent. |
| `STATE.md` | Agent | The durable working memory. Implementer notes, reviewer findings, security findings, test coverage report, acceptance findings, decider output. Survives compaction. |
| `pipeline.md` | You + agent | Optional. Opts into multi-stage pipeline mode. YAML frontmatter + markdown body. |
| `caffeine.config.json` | You | Verification commands the agent runs after every meaningful edit, plus model and cost ceiling. |

The Stop hook is the trick that keeps the agent grinding through the backlog. Whenever the agent tries to stop, the hook checks `BACKLOG.md` for unchecked top-level tasks and refuses the stop with a "you still have N tasks left" reason. A three-strikes fixed-point detector lets the agent actually stop when it has correctly identified an external blocker — no spam loops.

## Quick start

```bash
git clone https://github.com/pavvann/caffeine.git
cd caffeine
pnpm install
pnpm dev
```

Once the window opens:

1. Pick a target repo (any project you want the agent to work on).
2. Click **Backlog**, write some tasks with acceptance criteria — or run `/caffeine` in Claude Code first to generate them.
3. Click **Start**. The agent reads `BACKLOG.md`, picks the top unchecked task, implements it against its ACs, runs your verification commands, ticks the ACs and then the parent, and moves on.

Caffeine inherits your local `claude` CLI's OAuth credentials. No API key to configure. If a session fails to start, run `claude` in a terminal once to confirm you're signed in.

## Sequential mode (v1)

The default when no `pipeline.md` is present. One agent walks `BACKLOG.md` top to bottom. After each task, an adversarial reviewer subagent inspects the diff and reports findings to `STATE.md`. The Stop hook keeps the loop alive until every top-level box is checked.

A good `BACKLOG.md` looks like this:

```markdown
# Project — feature description

[Meta-context for the agent: what this is, what to read first, architecture decisions already locked.]

## Phase 0: Safety net
- [ ] Write `src/main/agent/hooks.test.ts` covering the Stop hook ...
  - [ ] AC: Test file exists with three behavioral cases (block / allow / pipeline-mode).
  - [ ] AC: `pnpm test` runs the new file and all three cases pass against the unmodified source.
  - [ ] AC: A deliberate one-character break in `hooks.ts` causes at least one test to fail.

## Phase 1: New surface area
- [ ] Create `src/main/pipeline/types.ts` exporting `Pipeline` type with fields ...
  - [ ] AC: `import { Pipeline } from "./types"` resolves with the documented field set.
  - [ ] AC: Typecheck passes; no `any` or `unknown` in the exported shape.

## Phase 4: Validation
- [ ] Run `pnpm typecheck`. Must pass.
  - [ ] AC: `pnpm typecheck` exits 0.
- [ ] Run `pnpm test`. All tests must pass.
  - [ ] AC: `pnpm test` exits 0 with no `.skip` or `.todo` introduced this run.
```

Tasks are risk-ordered: safety nets first, new files second, load-bearing modifications last. Every task names file paths, function signatures, and test cases. Vagueness becomes wasted hours when you're handing the file to an autonomous agent.

**Acceptance criteria** (the indented `- [ ] AC: ...` rows) are the contract — they define what "done" actually looks like in observable terms. The implementer ticks them as evidence accrues, and the `critic` subagent (in pipeline mode) verifies them against the diff. Without ACs, "tests pass" stops being trustworthy signal because the implementer wrote both the code and the tests; with ACs, the loop has something independent to grade against.

The `/caffeine` skill writes backlogs in this shape automatically.

## Pipeline mode (v2)

Drop a `pipeline.md` at your repo root and Caffeine engages pipeline mode. Each backlog item now flows through a configurable per-task stage list, integration commands run once after the whole backlog drains, and a decider subagent decides whether to ship, loop, or halt.

Here's the canonical shape:

```yaml
---
per_task:
  - reviewer
  - security
  - tester
  - critic
on_backlog_complete:
  - run: pnpm typecheck
  - run: pnpm build
  - run: pnpm test
decider:
  max_iterations: 3
  cost_ceiling_per_iteration_usd: 5
---

# Pipeline rationale

[Markdown body — explain why each stage is here. Ignored by the parser, read by humans.]
```

### Per-task stages

Stages are markdown files in `agents/<name>.md`. Bundled stages ship with the app; drop your own `agents/<name>.md` in your target repo to add custom stages or override bundled ones — user files win on name conflict. Each agent file is YAML frontmatter (name, description, tools, model) plus a prompt body.

- `reviewer` — adversarial diff critique focused on code-level issues and semantic mismatches. Read-only. Reports to `STATE.md`.
- `security` — scans the diff for secrets, injection, missing authz, unsafe deserialization. Bash-enabled so it can run `gitleaks` if available.
- `tester` — reads the active task's ACs **before** the diff, writes tests against the requirement (not the implementation), runs the suite, and produces a coverage report mapping ACs → tests.
- `critic` — acceptance critic. Reads the original task + its ACs + the staged diff + STATE.md and renders a per-AC verdict (`pass` / `partial` / `missed` / `ungrounded`) with concrete evidence, plus any **gaps** (criteria the task implied but didn't enumerate). Writes structured JSON to `STATE.md`. Place last in `per_task` so it can weigh the other stages' findings. **This is what stops the loop being theatre** — without an independent critic, the implementer writes both the code and the tests, so green tests only mean the implementer agreed with itself.

### The decider

After the integration commands run, an agentic decider reads `STATE.md` (including the critic's `## Acceptance Findings`), the staged diff, and the failed commands, then writes a structured JSON decision back to `STATE.md`:

```json
{
  "decision": "loop",
  "reason": "Critic flagged 2 partial ACs on the auth task; tests green but the error toast isn't wired.",
  "loop_tasks": [
    "Wire the error toast for failed Google auth in src/auth/login.ts:84 — current handler swallows the rejection",
    "Add an AC under the OAuth task: 'Failed auth shows the existing error toast component'"
  ]
}
```

`done` requires both that the e2e exit code is 0 AND that every critic verdict in this iteration is `"overall": "complete"`. Green tests with `incomplete` acceptance findings means the implementer wrote code that compiles and passes tests but doesn't satisfy what was asked — the decider loops. When the critic supplies per-AC `loop_task` strings, the decider prefers them verbatim (the critic already authored them with full context). Capped by `max_iterations`.

This is the actual differentiator. Devin, Cognition, and Cursor's background agents all promise autonomy, but none of them loop back on integration failure with targeted next-step tasks authored by an agent that read the full failure context **and** verified the work against explicit acceptance criteria written by a third party.

## DCG, not DAG

Workflow engines you've used (LangGraph, GitHub Actions, Airflow) are DAGs. Forward flow only. Edges go one way. They can't express "if the critic says we didn't actually do what was asked, go back and try again with these specific fixes."

Caffeine is a DCG. The decider is a conditional edge that points back to the top of the graph (or to `done`, or to `halt`). Cycles plus conditional outputs are the primitive that makes autonomous overnight work possible. The single visual element on the **Pipeline** tab that earns the framing is the curved arrow on the right margin going from the decider back to the per-task lane.

## The /caffeine skill

Authoring `BACKLOG.md` and `pipeline.md` by hand works, but the agent should draft them for you. Caffeine ships a Claude Code skill at `skills/caffeine/SKILL.md`.

```bash
mkdir -p ~/.claude/skills/caffeine
cp skills/caffeine/SKILL.md ~/.claude/skills/caffeine/SKILL.md
```

Then in any Claude Code session:

```
/caffeine
```

The skill asks three to five questions about what you're building, reads your project state (runtime, test framework, recent git history, existing files), and drafts a risk-ordered `BACKLOG.md` with 2–5 acceptance criteria per task. If you say yes to pipeline mode, it also drafts a `pipeline.md` with stages chosen based on what your backlog touches (security agent if you're touching auth or HTTP handlers; tester agent if your tasks add new behavior; critic if your backlog has ACs — which it will, because the skill won't let you ship a backlog without them).

The agent drafts. You direct. That's the product thesis.

## Walkthrough

Five tabs:

- **Session** — live transcript with the agent's tool calls, assistant text, status, token + cost counter. Pause / Stop / Intervene buttons. Restored from disk on project open.
- **Backlog** — `BACKLOG.md` editor. Read mode shows rendered markdown plus a clickable rail with top-level tasks (and indented AC rows underneath). Raw mode is a full-width markdown editor.
- **Pipeline** — DCG visualizer. Read mode shows the graph with live stage highlighting (driven by `SubagentStart`/`SubagentStop` hooks, not orchestrator queue events). Edit mode is drag-and-drop reorder of per-task stages with a palette of available agents loaded dynamically from `agents/*.md`. Raw mode is the underlying `pipeline.md`.
- **State** — `STATE.md` viewer. Read mode renders markdown. Raw mode shows the underlying text. Live-updates from `chokidar` as the agent writes.
- **Settings** — model selector, verification commands, cost ceiling. Per-project, persisted to `caffeine.config.json`.

## Architecture

```
agents/                    Bundled subagent prompts (markdown + YAML frontmatter).
├── reviewer.md            Override any of these by dropping a same-named file
├── security.md            in your target repo's agents/ directory.
├── tester.md
├── critic.md
└── decider.md

src/
├── main/
│   ├── index.ts                Process entry, window mgmt
│   ├── ipc.ts                  Typed IPC handlers
│   ├── agent/
│   │   ├── runner.ts           Claude Agent SDK loop, lifecycle
│   │   ├── prompts.ts          Curated v1 implementer system prompt (AC-aware)
│   │   ├── loader.ts           Discovers agents/*.md (bundled + user-override)
│   │   ├── hooks.ts            PreToolUse / PostToolUse / Stop / SubagentStart
│   │   └── promptBus.ts        Async iterable for mid-session message injection
│   ├── pipeline/
│   │   ├── types.ts            Pipeline shape
│   │   ├── parser.ts           YAML frontmatter parse + write
│   │   ├── decider.ts          Pure decision logic + agentic flow
│   │   └── orchestrator.ts     Per-task → integration → decider loop
│   ├── repo/
│   │   ├── backlog.ts          BACKLOG.md read/write/parse + acceptance criteria
│   │   ├── state.ts            STATE.md chokidar watcher
│   │   └── config.ts           caffeine.config.json + verification prompt section
│   └── db/
│       ├── schema.ts           SQLite schema (projects, sessions, transcript_events)
│       └── queries.ts          better-sqlite3 prepared statements
├── preload/
│   └── index.ts                contextBridge typed API surface
├── renderer/
│   ├── App.tsx                 Top-level shell, project routing
│   ├── store.ts                Zustand store, ingest/hydrateHistory
│   ├── views/                  Session, Backlog, Pipeline, StateFile, Settings, ProjectPicker
│   └── components/             TranscriptRow, StatusBar, Sidebar, MarkdownView, SegToggle
└── shared/
    └── types.ts                IPC channels + SessionEvent wire types
```

The `Stop` hook in `src/main/agent/hooks.ts` is where the long-run trick lives. The orchestrator in `src/main/pipeline/orchestrator.ts` is where the DCG runs. The `subagent-state` events from `SubagentStart` / `SubagentStop` hooks drive the live stage highlight in the renderer — driven by actual subagent execution, not by orchestrator queue events. (See `src/renderer/store.test.ts` for the regression tests that lock that semantic in.)

## Stack

- `@anthropic-ai/claude-agent-sdk` for the agent runtime — `query()`, `AgentDefinition`, hooks (`PreToolUse` / `PostToolUse` / `Stop` / `SubagentStart` / `SubagentStop`), session resume by ID.
- React 19, TypeScript, Vite, Tailwind 3 for the UI.
- Electron 41 to ship it as a desktop app you can run anywhere you have Node and the `claude` CLI signed in.
- `better-sqlite3` for projects, sessions, and transcript persistence (synchronous, ideal for the main process).
- `chokidar` for watching `STATE.md` and `pipeline.md` on disk.
- `react-markdown` + `remark-gfm` for the rendered Read views.
- `zustand` for renderer state.
- Vitest for tests.

## Status

The product builds itself: most commits on `main` since the v1 baseline were either authored by Caffeine in autonomous mode, reviewed by Caffeine's reviewer subagent, or both. The `STATE.md` from those runs is committed alongside the code as the lab notebook.

What's next, roughly:

- Browse past sessions, not just the latest.
- Per-iteration acceptance findings diff in the Pipeline tab so you can see which ACs flipped from `partial` to `pass` across iterations.
- Auto-detect stale preload bridges and prompt to restart `pnpm dev` (preload doesn't HMR; this is a known DX rough edge).
- One-click installer for non-developers and an in-app skill installer.

## License

Not yet specified. Treat as all-rights-reserved until a `LICENSE` file lands.
