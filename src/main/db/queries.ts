import { basename } from "node:path";
import { getDb } from "./schema";
import type { Project } from "@shared/types";

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
