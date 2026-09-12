import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { resolve, join } from "node:path";

export function openDatabase(dataDir: string) {
  const dir = resolve(dataDir);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, "living-poster.sqlite");
  const db = new DatabaseSync(path);
  try {
    chmodSync(path, 0o600);
  } catch {
    /* Windows inherits the user's directory ACL. */
  }
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS owners(id TEXT PRIMARY KEY, password_hash TEXT NOT NULL, salt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES owners(id), expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES owners(id), name TEXT NOT NULL, head_revision_id TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS revisions(id TEXT NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id), parent_id TEXT, label TEXT NOT NULL, created_at TEXT NOT NULL, scene TEXT NOT NULL, PRIMARY KEY(project_id,id));
    CREATE TABLE IF NOT EXISTS operations(owner_id TEXT NOT NULL, operation_id TEXT NOT NULL, payload_hash TEXT NOT NULL, response TEXT NOT NULL, PRIMARY KEY(owner_id,operation_id));
    CREATE TABLE IF NOT EXISTS shares(id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES owners(id), project_id TEXT NOT NULL REFERENCES projects(id), token_hash TEXT UNIQUE NOT NULL, token TEXT NOT NULL, title TEXT NOT NULL, scene TEXT NOT NULL, created_at TEXT NOT NULL, revoked INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS ai_requests(owner_id TEXT NOT NULL REFERENCES owners(id), request_id TEXT NOT NULL, payload_hash TEXT NOT NULL, input TEXT NOT NULL, status TEXT NOT NULL, result TEXT, error TEXT, model TEXT NOT NULL, created_at TEXT NOT NULL, latency_ms INTEGER, input_tokens INTEGER, output_tokens INTEGER, disposition TEXT, applied_revision_id TEXT, PRIMARY KEY(owner_id,request_id));
    UPDATE ai_requests SET status='indeterminate',error='The server restarted before the model outcome was recorded. Submit a new request to try again.' WHERE status IN ('queued','running');`);
  return db;
}

export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const value = fn();
    db.exec("COMMIT");
    return value;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
