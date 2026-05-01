// Single in-process session manager. v1 is single-session by design
// (see plan: scope decision "one session at a time"), so a module-level
// singleton is the right shape here — promoting to a Map keyed by project
// would only be needed when M-future adds multi-session.

import type { RunningSession } from "./runner";

let current: { project: string; session: RunningSession } | null = null;

export function getCurrent(): typeof current {
  return current;
}

export function setCurrent(value: typeof current): void {
  current = value;
}

export function clearCurrent(): void {
  current = null;
}
