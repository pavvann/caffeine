import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { CaffeineConfig } from "@shared/types";

const FILENAME = "caffeine.config.json";

export async function readConfig(repoPath: string): Promise<CaffeineConfig> {
  const path = join(repoPath, FILENAME);
  if (!existsSync(path)) {
    const detected = await detectConfig(repoPath);
    await writeFile(path, JSON.stringify(detected, null, 2) + "\n", "utf8");
    return detected;
  }
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as CaffeineConfig;
  } catch {
    return {};
  }
}

export async function writeConfig(
  repoPath: string,
  config: CaffeineConfig,
): Promise<void> {
  await writeFile(
    join(repoPath, FILENAME),
    JSON.stringify(config, null, 2) + "\n",
    "utf8",
  );
}

/**
 * Inspect the repo for common build tools and pre-fill verification
 * commands. Conservative — only sets a command if a corresponding script
 * actually exists. The agent will skip undefined commands.
 */
async function detectConfig(repoPath: string): Promise<CaffeineConfig> {
  const config: CaffeineConfig = { verification: {}, costCeilingUsd: 25 };
  const pkgPath = join(repoPath, "package.json");

  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as {
        scripts?: Record<string, string>;
      };
      const scripts = pkg.scripts ?? {};
      const runner = pickRunner(repoPath);
      if (scripts.test) config.verification!.test = `${runner} test`;
      if (scripts.build) config.verification!.build = `${runner} build`;
      if (scripts.lint) config.verification!.lint = `${runner} lint`;
      if (scripts.typecheck) config.verification!.typecheck = `${runner} typecheck`;
    } catch {
      // ignore — leave verification empty for the user to fill in
    }
  }

  return config;
}

function pickRunner(repoPath: string): string {
  if (existsSync(join(repoPath, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(repoPath, "yarn.lock"))) return "yarn";
  if (existsSync(join(repoPath, "bun.lockb"))) return "bun run";
  return "npm run";
}

/** Compose a short text block listing verification commands for the agent. */
export function verificationPromptSection(config: CaffeineConfig): string {
  const v = config.verification ?? {};
  const lines: string[] = [];
  if (v.test) lines.push(`- test: \`${v.test}\``);
  if (v.build) lines.push(`- build: \`${v.build}\``);
  if (v.lint) lines.push(`- lint: \`${v.lint}\``);
  if (v.typecheck) lines.push(`- typecheck: \`${v.typecheck}\``);
  if (lines.length === 0) {
    return `\n\nVERIFICATION COMMANDS: none configured. Read caffeine.config.json — if empty, infer from package.json or skip the verification step for this project.`;
  }
  return `\n\nVERIFICATION COMMANDS (run after every meaningful edit; never proceed past a red gate):\n${lines.join("\n")}`;
}
