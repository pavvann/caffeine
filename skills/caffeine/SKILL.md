---
name: caffeine
description: Draft a well-structured BACKLOG.md for the Caffeine Electron app to work through autonomously. Use when starting a new feature, refactor, or bug-fix sweep that you want to hand to a long-running Claude Code session. Produces a risk-ordered, specific backlog that v1's runner can chew through without asking questions. Triggers — user types "/caffeine", says "draft a backlog", "make a backlog for caffeine", "plan this for caffeine", or asks how to set up an autonomous run.
---

# Caffeine — Backlog generator

You are about to help the user produce a `BACKLOG.md` for the Caffeine Electron app. Caffeine is a long-running Claude Code agent runner — it reads `BACKLOG.md`, picks the top unchecked task, executes it, runs verification commands, invokes a `reviewer` subagent, ticks the box, and continues until the backlog drains. The `Stop` hook keeps the session alive while unchecked items remain.

A well-structured backlog is the difference between a 1-hour run that ships clean code and a 4-hour run that produces slop the user has to throw away.

This skill produces ONE artifact: `BACKLOG.md`. No code. No scaffolding. The output is what the user feeds to Caffeine.

## Hard rules

1. **Every task must be specific.** Concrete file paths, function signatures, test case descriptions. Bad: "add tests for the auth module." Good: `Write src/auth/login.test.ts with three cases: (a) valid creds → returns session, (b) invalid → throws AuthError, (c) expired token → throws TokenExpired. Mock the user repo via vi.mock('@/repo/users').`
2. **Risk-ordered phases.** Safety net first (regression tests for anything load-bearing being modified), then new files (no risk), then extensions, then load-bearing modifications, then validation. Never invert this.
3. **The first task is ALWAYS a regression test** if the backlog includes modifications to existing code that isn't already covered. Non-negotiable.
4. **Architecture decisions go in the preamble** so the agent doesn't relitigate them mid-run.
5. **Right-size each task** to ~30–90 minutes of agent work. Bigger → split. Smaller → bundle.
6. **No half-features.** A task that adds a function must also add the test. A task that modifies a function must also update the test.
7. **No filler.** Don't include "set up the project" or "initialize git" — assume the project is real and existing.
8. **No vague tasks.** "Improve performance" / "refactor for clarity" don't belong in an agent-executable backlog. Every task must be concrete and verifiable.

## Phase 1: Read project state

Run silently — no chat needed yet. Gather:

- **Runtime detection:** check for `package.json` (Node), `pyproject.toml` / `requirements.txt` (Python), `go.mod` (Go), `Cargo.toml` (Rust). Note the language and any test/build/lint scripts you find.
- **CLAUDE.md** — if present, note conventions the agent must follow (test framework, commit style, file organization).
- **README.md** — if present, extract project purpose in one line.
- **Recent context:** `git log --oneline -20` for what the user has been working on.
- **Existing BACKLOG.md** — if it exists, ask the user (Phase 2 question 0) whether to extend or replace.

State the project state in one paragraph for the user before moving to interview. Example: "I see a Node project with Vitest tests, an Electron main + renderer split, and recent commits around pipeline mode. CLAUDE.md says tests are non-negotiable. Existing BACKLOG.md is fully checked."

## Phase 2: Interview

Ask each question via `AskUserQuestion`, **one at a time**. Do not batch. Stop after each. Skip a question if its answer is unambiguous from Phase 1 context.

**Q1. What are you building?** Free-form. One or two sentences. The user types it. (You'll use this for the backlog title and meta-context paragraph.)

**Q2. What's the current state of the code you'll be touching?** Options:
- A) **Clean slate** — no existing implementation
- B) **Extending an existing module** — adding to it, not changing it
- C) **Modifying load-bearing code** — changing existing behavior
- D) **Bug-fix sweep** — fixing existing broken behavior

The answer determines how much Phase 0 (safety net) you write. C and D need regression tests first; A skips Phase 0 entirely.

**Q3. What does done look like?** Free-form. The user types acceptance criteria — the test that should pass at the end. You'll turn this into Phase 4 (validation) tasks.

**Q4. Pipeline mode or v1 sequential?** Options:
- A) **v1 sequential** — implementer + reviewer subagent per task. Default. Works without `pipeline.md`.
- B) **Pipeline mode** — implementer + reviewer + security + tester per task. Requires `pipeline.md`. Each task gets multi-stage scrutiny so individual task descriptions can be slightly less explicit (the reviewer/security/tester subagents catch what the implementer misses).

**Q5 (only if Q2 is C or D):** What's the specific load-bearing function/module being modified? You need this to write the regression test in Phase 0.

That's the maximum interview length. Five questions, often three or four. If the user types impatient ("just do it", "skip the questions"), respect that — make reasonable assumptions and proceed to Phase 3.

## Phase 3: Decompose

Take the user's answers + the project state and produce a phase-organized task breakdown.

Apply these rules in order:

1. **Phase 0: safety net.** If Q2 was C or D, the first task(s) write regression tests for the load-bearing code from Q5. Use the project's test framework. Specify three concrete test cases minimum per regression test.
2. **Phase 1: new surface area.** Pure new files. Each task creates a single file with a defined public API and tests. No risk to existing behavior.
3. **Phase 2: extensions.** Tasks that ADD to existing code without changing existing behavior. Safer than Phase 3 because they're additive — old call sites are unaffected.
4. **Phase 3: load-bearing modifications.** Tasks that change existing behavior. Phase 0 regression tests must be in place first.
5. **Phase 4: validation.** Run typecheck + build + test (whichever exist in the project). Verify the user's acceptance criteria from Q3.

For each task, specify:

- **The file path(s) it touches.**
- **The function/class/component signature** it adds or modifies. If TypeScript: include types. If Python: include type hints if the project uses them.
- **The test cases it must produce.** Each one a one-line description with inputs → expected outputs.
- **Any mocks or fixtures** the test needs. Name them.

If you can't be specific about a task, ask the user one follow-up question rather than writing a vague task.

## Phase 4: Draft BACKLOG.md

Use this template. Fill in based on the interview. **Show the drafted file to the user inline before writing to disk** — let them eyeball before commit.

````markdown
# {project name} — {feature description from Q1}

{One paragraph derived from Q1 + Q3: what this backlog is for and what "done" looks like.}

**Meta-context for the agent:** You are working on {project} ({language}, {framework hints}). Read these files first to understand existing conventions: {list 2-4 most relevant files based on Phase 1 detection — entrypoints, related modules, CLAUDE.md if present}.

**Architecture decisions already locked (do not relitigate):**
- {auto-fill: e.g. "Tests live next to source as *.test.ts, run via `pnpm test`."}
- {auto-fill: e.g. "All new HTTP routes go in `src/routes/`, follow the existing handler signature in `src/routes/health.ts`."}
- {ask the user one targeted question if a key choice isn't obvious from project state}

**Order matters.** {One paragraph specific to THIS backlog: why Phase 0 exists (or doesn't), why the order matters.}

After every meaningful edit, run the verification commands in `caffeine.config.json`. After every task, invoke the `reviewer` subagent on the diff before marking the box checked.

---

## Phase 0: Safety net
{Include only if Q2 = C or D. Otherwise omit this entire section.}

- [ ] Write `src/<existing-file>.test.ts` covering the current behavior of `<function-name>(<args>): <return>`. Cases: (a) {happy path: input → output}, (b) {edge case 1: input → output}, (c) {edge case 2: input → output}. Mock {dependencies}. Confirm tests pass before any modification.

## Phase 1: New surface area

- [ ] Create `src/<new-feature>/types.ts` exporting type `<Name>` with fields: `<field>: <type>`, ...
- [ ] Create `src/<new-feature>/<module>.ts` exporting `<function-name>(<args>): <return>`. Behavior: {one-line spec}. Edge cases to handle: {list}. Errors thrown: {list}.
- [ ] Write `src/<new-feature>/<module>.test.ts` with cases: (a) ..., (b) ..., (c) ...

## Phase 2: Extensions
{Include only if applicable.}

- [ ] Extend `src/<existing-file>.ts` with `<new-function>(<args>): <return>`. Existing functions remain unchanged. Add corresponding tests in the existing `<existing-file>.test.ts`.

## Phase 3: Load-bearing modifications
{Include only if Q2 = C. Phase 0 must come first.}

- [ ] Modify `<existing-function>` in `src/<file>.ts` to {what changes}. Update existing tests in `src/<file>.test.ts` to reflect the new behavior. The Phase 0 regression test (which locked in the OLD behavior) is now expected to fail — update or delete it with a comment explaining why.

## Phase 4: Validation

- [ ] Run `<typecheck command>` and `<build command>`. Both must pass.
- [ ] Run `<test command>`. All tests must pass.
- [ ] Verify acceptance: {criterion from Q3, in concrete observable terms}.
{If pipeline mode (Q4 = B): also append a CHANGELOG entry summarizing what shipped.}
````

## Phase 5: Show, confirm, write

1. **Show the drafted markdown** in chat (inside a code fence with the backlog content).
2. **Confirm via AskUserQuestion:**
   - A) Write to `<repo-root>/BACKLOG.md` (recommended)
   - B) Write to a custom path
   - C) Append to existing `BACKLOG.md` instead of replacing
   - D) Discard and start over
3. **Write the file** using the Write tool.
4. **Tell the user what's next**, in this order:
   - "Open Caffeine, point it at this repo, click Start. v1 will work through the backlog sequentially."
   - If Q4 = B: "You also need a `pipeline.md` at the repo root for pipeline mode. Use the Pipeline tab in Caffeine (Edit or Raw mode) to author one, or copy a starter from caffeine's own `pipeline.md`."
   - "BACKLOG.md is the durable plan. `STATE.md` will be the agent's working notes during the run — check it after for lessons learned, decisions made, and any open questions the agent flagged."
   - "If the run hits a problem, the reviewer subagent will catch most things, and the verification commands will fail loudly before the agent moves on. Stop the session at any time from the Session tab."

## Voice and tone

Direct. Engineer-to-engineer. Show file paths. Show function signatures. Show test case descriptions in inputs → outputs form. The user is handing this file to an autonomous agent that will execute it without supervision; vagueness becomes wasted hours.

No filler. No "let me know if you have any questions" closings. End with the action.

## What NOT to do

- Don't write a backlog without running Phase 1 (project state). You'll guess wrong about the test framework, the file layout, or the conventions.
- Don't ask more than five interview questions. If you need a sixth, write the backlog with a `## Open Questions` section instead and let the user fill them in.
- Don't include filler tasks like "set up project structure" or "configure git". Assume the project is real and the user has already done the bootstrap.
- Don't include `TODO: figure out X` items in the backlog. If something needs figuring out, surface it during Phase 2 or as an explicit open question, not as an actionable task.
- Don't bundle unrelated changes into one task. One task = one logical unit of work.
- Don't skip the safety net phase to save effort. Caffeine's autonomous mode is exactly the situation where the regression net pays for itself; skipping it is the most expensive shortcut.
- Don't add commentary to the backlog file ("This is a great approach!", "Let me know if you have any questions!"). The agent doesn't need encouragement.

## Output rules

- The BACKLOG.md you write must parse with Caffeine's existing parser: GitHub-style checkbox tasks (`- [ ] task description`) at the top level. Sub-bullets are fine but won't be tracked as tasks.
- Use `## Phase N: <name>` headings to group tasks by phase. The Caffeine parser ignores headings — it only counts checkboxes — but humans reading the file rely on the structure.
- Keep the meta-context paragraph short (4–6 sentences). The agent reads it on every iteration; bloat costs tokens.
