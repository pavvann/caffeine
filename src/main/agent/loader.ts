// Discover agents from markdown files. The four bundled agents
// (reviewer, security, tester, decider) ship as `agents/<name>.md` in
// the Caffeine repo / packaged app. Users can drop their own
// `agents/<name>.md` in their target repo to add custom stages or
// override a bundled one (user wins on name conflict).
//
// Format mirrors Claude Code skill files: YAML frontmatter with
// `name`, `description`, optional `tools` and `model`, then the
// prompt body. We hand-roll the parser because the shape is small
// and we don't want a runtime YAML dep.

import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import type { AgentDefinition } from "@anthropic-ai/claude-agent-sdk";

export class AgentParseError extends Error {
  constructor(file: string, message: string) {
    super(`agents/${file}: ${message}`);
    this.name = "AgentParseError";
  }
}

export type LoadedAgent = {
  name: string;
  description: string;
  tools?: string[];
  model?: string;
  prompt: string;
  /** Where this agent was loaded from — useful for debug / "which one wins?". */
  source: "bundled" | "user";
  filePath: string;
};

/**
 * Resolve the directory holding the bundled defaults.
 *
 * - In dev mode (`pnpm dev`), `app.getAppPath()` returns the project
 *   root, and `agents/` lives there.
 * - In packaged builds, `extraResources` in package.json copies
 *   `agents/` into `<resources>/agents/`. `process.resourcesPath`
 *   points at that.
 */
export function bundledAgentsDir(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "agents");
  }
  return join(app.getAppPath(), "agents");
}

/** Resolve the per-project user-agents directory (may not exist). */
export function userAgentsDir(repoPath: string): string {
  return join(repoPath, "agents");
}

/**
 * Load all agents available for a session. User agents (in the
 * target repo's `agents/` dir) override bundled defaults by name.
 * Returns a map keyed by `name` so the runner can pass it directly
 * to `options.agents`.
 */
export async function loadAgents(
  repoPath: string,
): Promise<Map<string, LoadedAgent>> {
  const merged = new Map<string, LoadedAgent>();

  // Bundled first — user overrides win.
  const bundled = await readAgentsFromDir(bundledAgentsDir(), "bundled");
  for (const a of bundled) merged.set(a.name, a);

  const user = await readAgentsFromDir(userAgentsDir(repoPath), "user");
  for (const a of user) merged.set(a.name, a);

  return merged;
}

async function readAgentsFromDir(
  dir: string,
  source: "bundled" | "user",
): Promise<LoadedAgent[]> {
  if (!existsSync(dir)) return [];
  const files = await readdir(dir);
  const out: LoadedAgent[] = [];
  for (const f of files) {
    if (!f.endsWith(".md")) continue;
    const filePath = join(dir, f);
    const text = await readFile(filePath, "utf8");
    out.push(parseAgentMarkdown(f, text, source, filePath));
  }
  return out;
}

/**
 * Parse a single agent markdown file. Frontmatter must come first
 * between `---` fences; the body after the closing fence is the
 * prompt verbatim (trimmed of leading/trailing whitespace).
 */
export function parseAgentMarkdown(
  fileName: string,
  text: string,
  source: "bundled" | "user",
  filePath: string,
): LoadedAgent {
  const fmMatch = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!fmMatch) {
    throw new AgentParseError(
      fileName,
      "missing YAML frontmatter (expected `---` fences at top of file)",
    );
  }
  const fm = parseFrontmatter(fileName, fmMatch[1]);
  const body = text.slice(fmMatch[0].length).trim();
  if (!body) {
    throw new AgentParseError(fileName, "missing prompt body after frontmatter");
  }

  if (typeof fm.name !== "string" || fm.name.length === 0) {
    throw new AgentParseError(fileName, "`name` is required in frontmatter");
  }
  if (typeof fm.description !== "string" || fm.description.length === 0) {
    throw new AgentParseError(
      fileName,
      "`description` is required in frontmatter",
    );
  }
  let tools: string[] | undefined;
  if (fm.tools !== undefined) {
    if (!Array.isArray(fm.tools) || !fm.tools.every((t) => typeof t === "string")) {
      throw new AgentParseError(fileName, "`tools` must be an array of strings");
    }
    tools = fm.tools as string[];
  }
  let model: string | undefined;
  if (fm.model !== undefined) {
    if (typeof fm.model !== "string") {
      throw new AgentParseError(fileName, "`model` must be a string");
    }
    model = fm.model;
  }

  return {
    name: fm.name,
    description: fm.description,
    tools,
    model,
    prompt: body,
    source,
    filePath,
  };
}

/**
 * Parse the small subset of YAML used in agent frontmatter: top-level
 * scalars (`key: value`) and string lists either as a flow array
 * (`[a, b, c]`) or a block sequence (`  - a\n  - b`).
 */
function parseFrontmatter(
  fileName: string,
  text: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "" || line.trim().startsWith("#")) {
      i++;
      continue;
    }
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
    if (!m) {
      throw new AgentParseError(
        fileName,
        `unexpected frontmatter line ${i + 1}: ${line}`,
      );
    }
    const key = m[1];
    const rest = m[2].trim();
    if (rest === "") {
      // Block list follows. Collect indented `- value` lines.
      const items: string[] = [];
      i++;
      while (i < lines.length) {
        const next = lines[i];
        if (/^\s+-\s+/.test(next)) {
          items.push(next.replace(/^\s+-\s+/, "").trim().replace(/^['"]|['"]$/g, ""));
          i++;
        } else if (next.trim() === "") {
          i++;
        } else {
          break;
        }
      }
      out[key] = items;
      continue;
    }
    if (rest.startsWith("[") && rest.endsWith("]")) {
      // Flow array of strings.
      const inner = rest.slice(1, -1).trim();
      const items = inner.length === 0
        ? []
        : inner.split(",").map((s) => s.trim().replace(/^['"]|['"]$/g, ""));
      out[key] = items;
      i++;
      continue;
    }
    out[key] = rest.replace(/^['"]|['"]$/g, "");
    i++;
  }
  return out;
}

/** Convert a LoadedAgent into the SDK's AgentDefinition shape. */
export function toAgentDefinition(a: LoadedAgent): AgentDefinition {
  const def: AgentDefinition = {
    description: a.description,
    prompt: a.prompt,
  };
  if (a.tools) def.tools = a.tools;
  if (a.model) def.model = a.model;
  return def;
}

/**
 * Build the SDK-shaped `agents` map from loaded agents. Convenience
 * for the runner.
 */
export function toAgentsRecord(
  loaded: Map<string, LoadedAgent>,
): Record<string, AgentDefinition> {
  const out: Record<string, AgentDefinition> = {};
  for (const [name, agent] of loaded) {
    out[name] = toAgentDefinition(agent);
  }
  return out;
}
