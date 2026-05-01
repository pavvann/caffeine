// Pipeline frontmatter parser. Reads `<repoPath>/pipeline.md`, slices
// out the YAML frontmatter between `---` markers, and validates it
// against the `Pipeline` shape. Returns `null` if the file is missing —
// pipeline mode is opt-in and v1 single-agent behavior is preserved
// when no pipeline.md exists.
//
// js-yaml is not a project dependency, so this file ships a minimal
// hand-rolled YAML parser sized for the constrained pipeline.md shape:
// top-level mapping; values are scalars, lists of scalars, lists of
// `key: value` objects, or nested mappings. Anything more exotic is
// not supported and will fail validation.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Pipeline } from "./types";

/** Raised on any malformed YAML or shape mismatch in pipeline.md. */
export class PipelineParseError extends Error {
  constructor(message: string) {
    super(`pipeline.md: ${message}`);
    this.name = "PipelineParseError";
  }
}

/**
 * Read and parse `<repoPath>/pipeline.md`. Returns `null` if the file
 * is missing. Throws {@link PipelineParseError} on malformed YAML or
 * missing/wrongly-typed required fields.
 */
export async function readPipeline(repoPath: string): Promise<Pipeline | null> {
  let text: string;
  try {
    text = await readFile(join(repoPath, "pipeline.md"), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw err;
  }

  const frontmatter = extractFrontmatter(text);
  const raw = parseYaml(frontmatter);
  return validatePipeline(raw);
}

// ---------------------------------------------------------------------------
// Frontmatter slicing
// ---------------------------------------------------------------------------

function extractFrontmatter(text: string): string {
  // Skip leading blank lines, require an opening `---`, then read until
  // a closing `---` or `...` on its own line. Throws with a precise
  // diagnostic so unterminated frontmatter doesn't masquerade as
  // missing frontmatter.
  const lines = text.split("\n");
  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;
  if (i >= lines.length || lines[i].trim() !== "---") {
    throw new PipelineParseError(
      "missing YAML frontmatter (expected `---` fences at top of file)",
    );
  }
  const start = i + 1;
  for (let j = start; j < lines.length; j++) {
    const t = lines[j].trim();
    if (t === "---" || t === "...") {
      return lines.slice(start, j).join("\n");
    }
  }
  throw new PipelineParseError(
    "unterminated YAML frontmatter (no closing `---` fence found)",
  );
}

// ---------------------------------------------------------------------------
// Minimal YAML parser
// ---------------------------------------------------------------------------

type YamlScalar = string | number | boolean | null;
type YamlValue = YamlScalar | YamlValue[] | { [key: string]: YamlValue };

type Line = { indent: number; content: string; lineNumber: number };

function tokenize(text: string): Line[] {
  const out: Line[] = [];
  text.split("\n").forEach((raw, i) => {
    const lineNumber = i + 1;
    // Drop comments where `#` is at the start of the trimmed content.
    // Trailing `# ...` after a value is left untouched: pipeline.md is
    // small and authors don't need that nuance.
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("#")) return;
    const indent = raw.match(/^(\s*)/)?.[1].length ?? 0;
    out.push({ indent, content: trimmed, lineNumber });
  });
  return out;
}

function parseYaml(text: string): YamlValue {
  const lines = tokenize(text);
  if (lines.length === 0) return {};
  const cursor = { i: 0 };
  const value = parseBlock(lines, cursor, lines[0].indent);
  if (cursor.i < lines.length) {
    throw new PipelineParseError(
      `unexpected content at line ${lines[cursor.i].lineNumber}: ${lines[cursor.i].content}`,
    );
  }
  return value;
}

function parseBlock(lines: Line[], cursor: { i: number }, indent: number): YamlValue {
  if (cursor.i >= lines.length) return null;
  const first = lines[cursor.i];
  if (first.indent !== indent) {
    throw new PipelineParseError(
      `unexpected indentation at line ${first.lineNumber}: expected ${indent} spaces, got ${first.indent}`,
    );
  }

  // Sequence: a run of `- ...` lines at this indent.
  if (first.content.startsWith("- ") || first.content === "-") {
    const items: YamlValue[] = [];
    while (
      cursor.i < lines.length &&
      lines[cursor.i].indent === indent &&
      (lines[cursor.i].content.startsWith("- ") || lines[cursor.i].content === "-")
    ) {
      const line = lines[cursor.i];
      cursor.i++;
      const body = line.content === "-" ? "" : line.content.slice(2).trim();
      // `- key: value` (or `- key:`) starts an inline mapping that may
      // be continued by more deeply-indented `key: value` lines.
      const keyMatch = body.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
      if (keyMatch) {
        const obj: Record<string, YamlValue> = {};
        const [, firstKey, firstValRaw] = keyMatch;
        if (firstValRaw === "") {
          obj[firstKey] = readNestedBlock(lines, cursor, indent);
        } else {
          obj[firstKey] = parseScalar(firstValRaw);
        }
        while (
          cursor.i < lines.length &&
          lines[cursor.i].indent > indent &&
          !lines[cursor.i].content.startsWith("- ")
        ) {
          const cont = lines[cursor.i];
          const m = cont.content.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
          if (!m) {
            throw new PipelineParseError(
              `expected key:value at line ${cont.lineNumber}, got: ${cont.content}`,
            );
          }
          cursor.i++;
          const [, k, vr] = m;
          if (vr === "") {
            obj[k] = readNestedBlock(lines, cursor, cont.indent);
          } else {
            obj[k] = parseScalar(vr);
          }
        }
        items.push(obj);
      } else if (body === "") {
        items.push(readNestedBlock(lines, cursor, indent));
      } else {
        items.push(parseScalar(body));
      }
    }
    return items;
  }

  // Mapping: a run of `key: value` (or `key:`) lines at this indent.
  const obj: Record<string, YamlValue> = {};
  while (cursor.i < lines.length && lines[cursor.i].indent === indent) {
    const line = lines[cursor.i];
    if (line.content.startsWith("- ")) break;
    const m = line.content.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
    if (!m) {
      throw new PipelineParseError(
        `malformed YAML at line ${line.lineNumber}: ${line.content}`,
      );
    }
    cursor.i++;
    const [, k, vr] = m;
    if (vr === "") {
      obj[k] = readNestedBlock(lines, cursor, indent);
    } else {
      obj[k] = parseScalar(vr);
    }
  }
  return obj;
}

/**
 * Descend into a nested block whose indentation is determined by the
 * next non-empty line. Returns null if no nested content exists.
 */
function readNestedBlock(
  lines: Line[],
  cursor: { i: number },
  parentIndent: number,
): YamlValue {
  if (cursor.i >= lines.length) return null;
  const next = lines[cursor.i];
  if (next.indent <= parentIndent) return null;
  return parseBlock(lines, cursor, next.indent);
}

function parseScalar(raw: string): YamlScalar {
  const trimmed = raw.trim();
  if (trimmed === "") return "";
  // Quoted strings preserve their string-ness even if they look like numbers.
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)
  ) {
    return trimmed.slice(1, -1);
  }
  if (trimmed === "null" || trimmed === "~") return null;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^-?\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10);
  if (/^-?\d*\.\d+$/.test(trimmed)) return Number.parseFloat(trimmed);
  return trimmed;
}

// ---------------------------------------------------------------------------
// Shape validation
// ---------------------------------------------------------------------------

function validatePipeline(raw: YamlValue): Pipeline {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new PipelineParseError("frontmatter must be a mapping at the top level");
  }
  const obj = raw as Record<string, YamlValue>;

  const per_task = expectField(obj, "per_task");
  if (!Array.isArray(per_task) || !per_task.every((x) => typeof x === "string")) {
    throw new PipelineParseError("`per_task` must be an array of strings");
  }

  const on_backlog_complete_raw = expectField(obj, "on_backlog_complete");
  if (!Array.isArray(on_backlog_complete_raw)) {
    throw new PipelineParseError("`on_backlog_complete` must be an array");
  }
  const on_backlog_complete = on_backlog_complete_raw.map((entry, i) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new PipelineParseError(
        `\`on_backlog_complete[${i}]\` must be a mapping with a \`run\` field`,
      );
    }
    const run = (entry as Record<string, YamlValue>).run;
    if (typeof run !== "string") {
      throw new PipelineParseError(
        `\`on_backlog_complete[${i}].run\` must be a string`,
      );
    }
    return { run };
  });

  const decider_raw = expectField(obj, "decider");
  if (decider_raw === null || typeof decider_raw !== "object" || Array.isArray(decider_raw)) {
    throw new PipelineParseError("`decider` must be a mapping");
  }
  const decider_obj = decider_raw as Record<string, YamlValue>;
  const max_iterations = decider_obj.max_iterations;
  if (typeof max_iterations !== "number" || !Number.isFinite(max_iterations)) {
    throw new PipelineParseError(
      "`decider.max_iterations` must be a number (got " + describe(max_iterations) + ")",
    );
  }
  if (!Number.isInteger(max_iterations) || max_iterations < 1) {
    throw new PipelineParseError(
      "`decider.max_iterations` must be a positive integer (got " + max_iterations + ")",
    );
  }
  let cost_ceiling: number | undefined;
  if ("cost_ceiling_per_iteration_usd" in decider_obj) {
    const v = decider_obj.cost_ceiling_per_iteration_usd;
    if (typeof v !== "number" || !Number.isFinite(v)) {
      throw new PipelineParseError(
        "`decider.cost_ceiling_per_iteration_usd` must be a number when present (got " +
          describe(v) +
          ")",
      );
    }
    cost_ceiling = v;
  }

  const decider: Pipeline["decider"] = { max_iterations };
  if (cost_ceiling !== undefined) decider.cost_ceiling_per_iteration_usd = cost_ceiling;

  return { per_task, on_backlog_complete, decider };
}

function expectField(obj: Record<string, YamlValue>, key: string): YamlValue {
  if (!(key in obj)) {
    throw new PipelineParseError(`missing required field \`${key}\``);
  }
  return obj[key];
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}
