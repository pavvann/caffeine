import chokidar, { type FSWatcher } from "chokidar";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { emitSessionEvent } from "../ipc";

const FILENAME = "STATE.md";

export async function readState(repoPath: string): Promise<string> {
  const path = join(repoPath, FILENAME);
  if (!existsSync(path)) return "";
  return readFile(path, "utf8");
}

let currentWatcher: FSWatcher | null = null;
let currentRepo: string | null = null;

/**
 * Start watching STATE.md in the given repo. Cheap to call repeatedly with the
 * same path; switching repos closes the prior watcher first.
 */
export function watchState(repoPath: string): void {
  if (currentRepo === repoPath && currentWatcher) return;
  stopWatching();

  currentRepo = repoPath;
  const path = join(repoPath, FILENAME);

  // awaitWriteFinish smooths out partial writes from editors that
  // truncate-then-write (which would otherwise emit an empty-file blip).
  currentWatcher = chokidar.watch(path, {
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
  });

  const broadcast = async () => {
    const content = await readState(repoPath).catch(() => "");
    emitSessionEvent({ kind: "state-file", content });
  };

  currentWatcher.on("add", broadcast);
  currentWatcher.on("change", broadcast);
  currentWatcher.on("unlink", () => {
    emitSessionEvent({ kind: "state-file", content: "" });
  });
}

export function stopWatching(): void {
  if (currentWatcher) {
    void currentWatcher.close();
    currentWatcher = null;
  }
  currentRepo = null;
}
