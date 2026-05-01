// Pipeline mode shared types. Loaded from `pipeline.md` at the root of a
// target repo. The YAML frontmatter parses into a `Pipeline`; the
// markdown body is rationale for humans and is intentionally ignored
// here.

/**
 * A pipeline definition. Top-level fields (`per_task`,
 * `on_backlog_complete`, `decider`) are required;
 * `decider.cost_ceiling_per_iteration_usd` is optional.
 *
 * Source of truth is the YAML frontmatter in `pipeline.md`. The parser
 * (Phase 1 task #4) is responsible for validating these shapes and
 * raising a typed error on mismatch.
 */
export type Pipeline = {
  /**
   * Names of stage agents to run in order on each unchecked BACKLOG.md
   * item. Each name is expected to resolve to an `AgentDefinition`
   * registered with the runner (e.g. `"reviewer"`, `"security"`,
   * `"tester"`). Resolution is the orchestrator's concern, not this
   * type's.
   */
  per_task: string[];

  /**
   * Shell commands to run once every backlog item is checked. The
   * orchestrator spawns each in order; the final exit code is fed to
   * `decide()`.
   */
  on_backlog_complete: { run: string }[];

  /**
   * Loop-control config consumed by `decide()` (Phase 1 task #6).
   */
  decider: {
    /** Hard cap on iterations before forcing `"halt"`. */
    max_iterations: number;
    /**
     * Optional per-iteration USD ceiling. Interpretation is left to the
     * orchestrator; absence means no per-iteration ceiling enforced
     * here.
     */
    cost_ceiling_per_iteration_usd?: number;
  };
};

/**
 * Helper signature for parsing YAML frontmatter into a `Pipeline`.
 * Implementation lives in `./parser.ts` (Phase 1 task #4). Declared as
 * a forward signature so callers can reference the shape from
 * `types.ts` without depending on parser internals.
 */
export declare function parsedPipelineFromFrontmatter(
  frontmatter: string,
): Pipeline;

// Compile-time bridge between this main-process type and the
// renderer-visible mirror in `src/shared/types.ts`. If anyone adds a
// non-optional field to `Pipeline`, this assertion fails at typecheck
// time and the renderer's `PipelineWireShape` must be updated.
import type { PipelineWireShape } from "@shared/types";
type _PipelineMatchesWire = Pipeline extends PipelineWireShape
  ? PipelineWireShape extends Pipeline
    ? true
    : never
  : never;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _pipelineWireBridge: _PipelineMatchesWire = true;
