# Caffeine v2 — Pipeline Mode build state

## Current Task

(none — backlog fully checked, v0.0.2 ready)

## Open Questions

(none)

## Decisions Made

- Architecture decisions in BACKLOG.md preamble are locked.
- Hook safety net (task 2) must exist before any modification of `hooks.ts`.
- `pnpm test` includes `--passWithNoTests` so the bootstrap commit exits 0; once tests land the flag is harmless. Comment in `vitest.config.ts` explains.

## Lessons Learned

- Vitest 4 exits 1 on "no tests found" by default; `--passWithNoTests` (or `passWithNoTests: true` in config) is required for the bootstrap state to be green.
- Vitest does not honor tsconfig `paths` automatically — the `@shared` alias must be re-declared in `vitest.config.ts` so test files match runtime imports.
- `hooks.ts` imports `electron` at module scope; tests must `vi.mock("electron", ...)` and `vi.mock("../ipc", ...)` (which transitively imports electron) so the module loads under plain node. The Stop hook itself does not touch electron, so stubbing those imports is safe.
- For pure type/contract files, prefer `export declare function name(...)` over a PascalCase type alias when the spec asks for a "helper signature" with a specific name — keeps the import name consistent with the spec and downstream tasks.
- When writing AgentDefinition prompts that include "use the X tool" instructions, double-check the `tools` array actually contains X. If the spec locks the tools list, change the prompt's wording (e.g. "use Bash with a heredoc append") rather than adding tools.
- For sentinel/marker files written by long-running orchestrators, always clear them at the *start* of a fresh run (best-effort `unlink`) and add to `.gitignore`. Otherwise the next session sees a stale flag and short-circuits.
- When a renderer needs to render `<index>/<total>`-style data, the IPC event must carry `total` directly. Inferring it on the renderer side requires reading filesystem state the renderer doesn't own. Extending the wire shape with the extra field is correct.
- Pipeline state in the renderer must be cleared on session boundaries (transition into `running`), not just on user "Clear transcript" — otherwise stale fields from a previous pipeline session leak into a fresh v1 session.
- Don't emit completion-style events the orchestrator can't actually observe — emit only what's truthful (e.g. `stage-started` at enqueue) and document the gap.
