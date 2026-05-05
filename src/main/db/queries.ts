import { basename } from "node:path";
import { getDb } from "./schema";
import type { Project, SessionEvent } from "@shared/types";

type Row = {
  id: string;
  name: string;
  path: string;
  last_session_id: string | null;
  last_opened_at: number;
};

const toProject = (r: Row): Project => ({
  id: r.id,
  name: r.name,
  path: r.path,
  lastSessionId: r.last_session_id,
  lastOpenedAt: r.last_opened_at,
});

export function listProjects(): Project[] {
  const rows = getDb()
    .prepare(
      `SELECT id, name, path, last_session_id, last_opened_at
       FROM projects ORDER BY last_opened_at DESC`,
    )
    .all() as Row[];
  return rows.map(toProject);
}

export function upsertProject(path: string): Project {
  const db = getDb();
  const existing = db
    .prepare(
      `SELECT id, name, path, last_session_id, last_opened_at FROM projects WHERE path = ?`,
    )
    .get(path) as Row | undefined;

  const now = Date.now();
  if (existing) {
    db.prepare(`UPDATE projects SET last_opened_at = ? WHERE id = ?`).run(
      now,
      existing.id,
    );
    return toProject({ ...existing, last_opened_at: now });
  }

  const id = crypto.randomUUID();
  const name = basename(path);
  db.prepare(
    `INSERT INTO projects (id, name, path, last_session_id, last_opened_at)
     VALUES (?, ?, ?, NULL, ?)`,
  ).run(id, name, path, now);
  return { id, name, path, lastSessionId: null, lastOpenedAt: now };
}

export function setLastSessionId(projectPath: string, sessionId: string): void {
  getDb()
    .prepare(`UPDATE projects SET last_session_id = ? WHERE path = ?`)
    .run(sessionId, projectPath);
}

export function recordSession(
  projectPath: string,
  sessionId: string,
): void {
  const project = getDb()
    .prepare(`SELECT id FROM projects WHERE path = ?`)
    .get(projectPath) as { id: string } | undefined;
  if (!project) return;
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO sessions (id, project_id, started_at) VALUES (?, ?, ?)`,
    )
    .run(sessionId, project.id, Date.now());
  setLastSessionId(projectPath, sessionId);
}

export function getLastSessionId(projectPath: string): string | null {
  const row = getDb()
    .prepare(`SELECT last_session_id FROM projects WHERE path = ?`)
    .get(projectPath) as { last_session_id: string | null } | undefined;
  return row?.last_session_id ?? null;
}

/**
 * Append a SessionEvent to the transcript log for `sessionId`.
 *
 * Called from `emitSessionEvent` for every event that flows to the
 * renderer once a session_id is known. Failures are non-fatal — we
 * log and continue rather than crash the session because of a write
 * error.
 */
export function appendTranscriptEvent(
  sessionId: string,
  event: SessionEvent,
): void {
  try {
    getDb()
      .prepare(
        `INSERT INTO transcript_events (session_id, recorded_at, event_json)
         VALUES (?, ?, ?)`,
      )
      .run(sessionId, Date.now(), JSON.stringify(event));
  } catch (err) {
    // FK failures here mean we got an event before recordSession()
    // had inserted the row for this session_id. Tolerate it — the
    // window of events we'd lose is < 100ms and they're typically
    // low-value status events, not tool calls.
    console.error("[caffeine] appendTranscriptEvent failed:", err);
  }
}

/**
 * Load every persisted event for a session, ordered by insertion.
 * Returned events are the shape that the renderer's `ingest()`
 * already handles. Caller is responsible for filtering events that
 * shouldn't be replayed during hydration (e.g. status, subagent-state).
 */
export function loadTranscriptEvents(sessionId: string): SessionEvent[] {
  const rows = getDb()
    .prepare(
      `SELECT event_json FROM transcript_events
       WHERE session_id = ?
       ORDER BY id ASC`,
    )
    .all(sessionId) as { event_json: string }[];
  const out: SessionEvent[] = [];
  for (const row of rows) {
    try {
      out.push(JSON.parse(row.event_json) as SessionEvent);
    } catch {
      // Skip malformed entries rather than failing the whole load.
    }
  }
  return out;
}

/**
 * Convenience: load the latest session's events for a project.
 * Returns an empty array if the project has never had a session.
 */
export function loadLatestSessionEvents(projectPath: string): SessionEvent[] {
  const sid = getLastSessionId(projectPath);
  if (!sid) return [];
  return loadTranscriptEvents(sid);
}
