---
name: caffeine
description: Set up Caffeine for an autonomous run — draft a BACKLOG.md and/or a pipeline.md for the Caffeine Electron app. Use when starting a new feature, refactor, or bug-fix sweep that you want to hand to a long-running Claude Code session, or when you want to enable pipeline mode (multi-stage subagent execution) on an existing backlog. Triggers — user types "/caffeine", says "draft a backlog", "make a pipeline", "set up caffeine", or asks how to set up an autonomous run.
---

# Caffeine — Setup helper

Two-mode skill that helps the user prepare an autonomous Caffeine run by drafting:

1. **`BACKLOG.md`** — the risk-ordered task list the agent works through. Caffeine v1's `Stop` hook keeps the session alive while unchecked items remain.
2. **`pipeline.md`** — the per-task and project-level stage configuration that opts into v0.0.3+ pipeline mode (multi-stage subagent execution + agentic loop-control decider).

The user picks one or both. This skill produces files. No code.

## Phase 0: Route

Use `AskUserQuestion` once to find out what the user wants. **What do you want to set up?**

- **A) Backlog only** — draft `BACKLOG.md`. Caffeine runs in v1 sequential mode (one implementer + reviewer subagent per task).
- **B) Pipeline only** — draft `pipeline.md`. Assumes a backlog exists or will be authored separately.
- **C) Both (recommended for fresh projects)** — backlog first, then a pipeline tailored to it.

Strong defaults: pick **C** when neither file exists yet. Pick **A** when only `BACKLOG.md` is missing. Pick **B** when only `pipeline.md` is missing. If both exist and the user typed `/caffeine` anyway, ask whether to refresh / extend / replace each one.

Routing:
- A → Phase 1 + Phase 2A + Phase 4 (closing).
- B → Phase 1 + Phase 2B + Phase 4 (closing).
- C → Phase 1 + Phase 2A + Phase 2B + Phase 4 (closing).

## Phase 1: Read project state

Run silently, no chat needed. Gather:

- **Runtime detection:** check for `package.json` (Node), `pyproject.toml` / `requirements.txt` (Python), `go.mod` (Go), `Cargo.toml` (Rust). Note the language and any `test`/`build`/`lint`/`typecheck` scripts.
- **CLAUDE.md** — if present, note conventions the agent must follow (test framework, commit style, file organization).
- **README.md** — if present, extract project purpose in one line.
- **Recent context:** `git log --oneline -20` for what the user has been working on.
- **caffeine.config.json** — if present, read existing verification commands and cost ceiling.
- **Existing BACKLOG.md / pipeline.md** — if either exists, note its current state for the routing decisions in Phase 2.

State the project state in one paragraph for the user before moving on. Example: "I see a Node project with Vitest tests, Electron main + renderer split, recent commits around pipeline mode. CLAUDE.md says tests are non-negotiable. BACKLOG.md is fully checked, pipeline.md exists with reviewer + security + tester stages."

## Phase 2A: Backlog flow

You are about to produce a `BACKLOG.md` file for Caffeine. A well-structured backlog is the difference between a 1-hour autonomous run that ships clean code and a 4-hour run that produces slop.

### Hard rules (apply to every task you write)

1. **Every task must be specific.** Concrete file paths, function signatures, test case descriptions. Bad: "add tests for auth." Good: `Write src/auth/login.test.ts with three cases: (a) valid creds → returns session, (b) invalid → throws AuthError, (c) expired token → throws TokenExpired. Mock the user repo via vi.mock('@/repo/users').`
2. **Risk-ordered phases.** Safety net first, then new files (no risk), then extensions, then load-bearing modifications, then validation. Never invert.
3. **The first task is ALWAYS a regression test** if the backlog includes modifications to existing code that isn't already covered. Non-negotiable.
4. **Architecture decisions go in the preamble** so the agent doesn't relitigate them mid-run.
5. **~30–90 minutes per task.** Bigger → split. Smaller → bundle.
6. **No half-features.** A task that adds a function adds the test. A task that modifies a function updates the test.
7. **No filler** ("set up project", "init git" — assume the project is real).
8. **No vague tasks** ("improve performance", "refactor for clarity") — every task must be concrete and verifiable.

### Interview

Ask via `AskUserQuestion`, **one at a time**. Skip a question if its answer is unambiguous from Phase 1.

1. **What are you building?** Free-form sentence. Used for backlog title and meta-context.
2. **Current state of the code you'll be touching?** A) Clean slate, B) Extending existing module, C) Modifying load-bearing code, D) Bug-fix sweep. Determines whether Phase 0 (safety net) appears.
3. **What does done look like?** Free-form acceptance criteria. Used to write Phase 4 (validation).
4. **Pipeline mode?** A) v1 sequential (default), B) Pipeline mode (only ask if Phase 0 routing was A; if user picked C, skip — they're getting both).
5. **(Only if Q2 is C or D.) Which specific function/module is being modified?** Needed to write the regression test in Phase 0.

Five questions max. If user types impatient ("just do it", "skip questions"), respect it — make reasonable assumptions and proceed.

### Decompose

Apply these rules in order:

1. **Phase 0: safety net.** If Q2 was C or D, the first task(s) write regression tests for the load-bearing code from Q5. Use the project's test framework. Three concrete cases minimum per regression test.
2. **Phase 1: new surface area.** Pure new files. Each task creates a single file with a defined public API and tests. No risk to existing behavior.
3. **Phase 2: extensions.** Tasks that ADD to existing code without changing existing behavior.
4. **Phase 3: load-bearing modifications.** Tasks that change existing behavior. Phase 0 must be in place.
5. **Phase 4: validation.** Run typecheck + build + test (whichever exist). Verify the user's acceptance criteria from Q3.

For each task specify:
- File path(s) it touches
- Function/class/component signature it adds or modifies (with types if TypeScript, type hints if Python project uses them)
- Test cases as one-line descriptions in `inputs → outputs` form
- Any mocks or fixtures by name

If you can't be specific, ask one follow-up rather than writing a vague task.

### Draft

Use this template. Show inline before writing to disk.

````markdown
# {project name} — {feature description from Q1}

{One paragraph: what this backlog is for and what "done" looks like, derived from Q1 + Q3.}

**Meta-context for the agent:** You are working on {project} ({language}, {framework hints}). Read these files first to understand existing conventions: {2–4 most relevant files based on Phase 1 detection}.

**Architecture decisions already locked (do not relitigate):**
- {auto-fill from project state, e.g. "Tests live next to source as *.test.ts, run via `pnpm test`."}
- {auto-fill, e.g. "All new HTTP routes go in `src/routes/`, follow the existing handler signature in `src/routes/health.ts`."}

**Order matters.** {One paragraph specific to THIS backlog.}

After every meaningful edit, run the verification commands in `caffeine.config.json`. After every task, invoke the `reviewer` subagent on the diff before marking the box checked.

---

## Phase 0: Safety net
{Only if Q2 = C or D.}

- [ ] Write `src/<existing-file>.test.ts` covering current behavior of `<function-name>(<args>): <return>`. Cases: (a) {happy path}, (b) {edge}, (c) {edge}. Mock {dependencies}. Confirm tests pass before any modification.

## Phase 1: New surface area

- [ ] Create `src/<new-feature>/types.ts` exporting type `<Name>` with fields ...
- [ ] Create `src/<new-feature>/<module>.ts` exporting `<function-name>(<args>): <return>`. Behavior: ... Edge cases: ... Errors: ...
- [ ] Write `src/<new-feature>/<module>.test.ts` with cases: (a) ..., (b) ..., (c) ...

## Phase 2: Extensions

- [ ] Extend `src/<existing-file>.ts` with `<new-function>(<args>): <return>`. Existing functions unchanged. Add tests in existing `<existing-file>.test.ts`.

## Phase 3: Load-bearing modifications
{Only if Q2 = C.}

- [ ] Modify `<existing-function>` in `src/<file>.ts` to {what changes}. Update existing tests in `src/<file>.test.ts`. The Phase 0 regression test (which locked in OLD behavior) is now expected to fail — update with a comment explaining why.

## Phase 4: Validation

- [ ] Run `<typecheck command>` and `<build command>`. Both must pass.
- [ ] Run `<test command>`. All tests pass, including Phase 0 regression tests where still applicable.
- [ ] Verify acceptance: {criterion from Q3, in concrete observable terms}.
````

### Show + confirm + write

1. Show the drafted markdown in chat (inside a code fence).
2. Confirm via AskUserQuestion: A) Write to `<repo-root>/BACKLOG.md`, B) Write to custom path, C) Append to existing instead of replacing, D) Discard.
3. Write the file. Continue to Phase 2B if route was C, otherwise Phase 4 (closing).

## Phase 2B: Pipeline flow

You are about to produce a `pipeline.md` file for Caffeine. Pipeline mode tells the runner to invoke per-task stage subagents after the implementer finishes each backlog item, then run integration commands once the backlog drains, then ask the agentic decider whether to loop / done / halt.

### Available stages (v0.0.3)

These are the registered `AgentDefinition`s in `src/main/agent/runner.ts:115`. Custom stages need code (not in scope for this skill).

- **reviewer** — adversarial diff critique. Writes findings to STATE.md. Cheap, catches missed edge cases.
- **security** — scans diff for secrets, injection sinks, missing authz, unsafe deserialization. Writes to STATE.md.
- **tester** — writes/updates tests for the diff, runs the test suite to confirm. Read+write to source.
- **decider** — loop-control agent invoked automatically at the end of each iteration. NOT a per_task stage; auto-wired by the orchestrator.

### Auto-detect from project state

Before asking anything, derive defaults from Phase 1:

- **on_backlog_complete commands:** Pull from `caffeine.config.json` `verification` if present, else from `package.json` `scripts`. Standard order is fast → slow: `typecheck` → `build` → `lint` → `test` → `e2e`. Include only commands that actually exist as scripts.
- **Stage recommendations from BACKLOG.md (if present):**
  - `reviewer` — always recommended.
  - `security` — recommended if backlog touches: auth, secrets, env vars, HTTP handlers, input parsing, deserialization, file uploads, IPC. Search the backlog text for those terms.
  - `tester` — recommended if backlog has tasks that ADD new behavior without explicit "Write `*.test.ts`" tasks of their own. Skip if the backlog already covers tests in every task.

### Interview

Two questions max. Auto-fill the rest.

**P1. Which per_task stages?** (Multi-select.)

Show the auto-detected recommendations with one-line justifications. Example:

> Recommended stages for this backlog:
> - ✓ **reviewer** — always-on diff critique
> - ✓ **security** — backlog touches `src/auth/` and `src/routes/`, security scan adds value
> - ☐ **tester** — backlog already includes test tasks for every new function, tester would be redundant
>
> Override?

User confirms or edits the selection.

**P2. Iteration cap?** Three options:
- **1** — single pass, no looping (simplest, fastest, no autonomous retry on integration failure)
- **3** — default (recommended for most cases — gives the decider room to fix up to two rounds of integration failures)
- **5** — long-running deep loops (overnight runs on flaky test suites or migration sweeps)

cost_ceiling_per_iteration_usd defaults to **5** without asking. Show it in the draft; the user can edit in Pipeline tab's Raw mode if they want.

### Draft

Use this template. Show inline before writing.

````markdown
---
per_task:
{one stage name per line, indented two spaces with leading "- "}
on_backlog_complete:
{one "- run: <cmd>" line per command}
decider:
  max_iterations: {N}
  cost_ceiling_per_iteration_usd: 5
---

# Pipeline — {one-line description derived from BACKLOG.md or user's intent}

{One paragraph: what this pipeline does in plain English. Mention iteration cap and what loop-back-on-failure looks like for THIS project.}

## per_task

{For each chosen stage, one short paragraph explaining what it does and why it's in this pipeline. If a stage was rejected during P1, note it in a "Stages not used" section with the one-line reason — saves the user from wondering later.}

## on_backlog_complete

{Brief explanation of why these specific commands run, in this order, after the backlog drains. Order rationale: fast gates first so failures show up before paying for slow ones.}

## decider

The decider is an agent (`src/main/agent/decider-agent.ts`). At the end of each iteration it reads STATE.md + the staged diff + the failed commands, then writes a structured decision to STATE.md under `## Decider Output: Iteration N`. On `loop`, it authors targeted `[LOOP-N]` task descriptions for the next iteration rather than dumping raw exit-code summaries.

`max_iterations: {N}` caps the loop. `cost_ceiling_per_iteration_usd: 5` is a per-iteration USD budget — independent of the session-level ceiling in `caffeine.config.json`.
````

### Show + confirm + write

1. Show the drafted pipeline.md inline.
2. Confirm via AskUserQuestion: A) Write to `<repo-root>/pipeline.md`, B) Write to custom path, C) Discard.
3. Write the file.

## Phase 4: Closing

Summarize what was created and what to do next. Concrete, no filler.

If a backlog was written:
- "`BACKLOG.md` is at `<path>` — {N} tasks across {M} phases."

If a pipeline was written:
- "`pipeline.md` is at `<path>` — pipeline mode will engage on next session start."

Then the action:

- "Open Caffeine, click the project picker, point at this repo, click Start."
- "v1 will work through BACKLOG.md sequentially. {If pipeline.md was written:} Each task gets reviewed by the per_task stages before the box ticks; on backlog complete the integration commands run, the decider decides done/loop/halt."
- "Watch the Pipeline tab to see the DCG render with live stage highlighting."
- "STATE.md will be the agent's working notes during the run — check it after for lessons learned, decisions made, and any open questions the agent flagged."

If the user is on the Caffeine repo itself (the meta case): mention they can run Caffeine on Caffeine — v1's Stop hook + reviewer subagent are sufficient to extend the project.

## Voice and tone

Direct. Engineer-to-engineer. Show file paths. Show function signatures. Show test case descriptions in `inputs → outputs` form. The user is handing these files to an autonomous agent that will execute them without supervision; vagueness becomes wasted hours.

No filler closings. No "Let me know if you have any questions!" End with the action.

## What NOT to do

- Don't write a backlog without running Phase 1 (project state). You'll guess wrong about the test framework, file layout, or conventions.
- Don't ask more than five backlog questions or two pipeline questions. If you need more, write the file with a `## Open Questions` section instead.
- Don't include filler tasks like "set up project structure" or "configure git". Assume the project is real.
- Don't include `TODO: figure out X` items — surface those as Phase 2 questions or as explicit open questions, never as actionable tasks.
- Don't bundle unrelated changes into one task. One task = one logical unit of work.
- Don't skip the safety net phase to save effort. Caffeine's autonomous mode is exactly when the regression net pays for itself.
- Don't add commentary to the output files ("This is a great approach!", "Let me know if you have any questions!"). The agent doesn't need encouragement.
- Don't recommend a stage in pipeline.md that isn't registered in `runner.ts`. The parser will accept it but the runtime will fail when it tries to invoke an unknown subagent.

## Output rules

- BACKLOG.md must use GitHub-style checkbox tasks (`- [ ] task`) at the top level. Caffeine's parser only counts checkboxes; sub-bullets are decorative.
- Use `## Phase N: <name>` headings to group tasks. Parser ignores them; humans rely on them.
- pipeline.md must have valid YAML frontmatter between `---` fences at the top. Stages must match `[A-Za-z0-9_-]+`. Commands in `on_backlog_complete` must be single-line.
- Keep the meta-context paragraphs short (4–6 sentences). The agent reads them on every iteration; bloat costs tokens.
