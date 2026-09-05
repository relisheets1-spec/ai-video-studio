import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DB_PATH } from "./env";

/**
 * База: один файл SQLite (node:sqlite, без нативных зависимостей).
 *
 * Схема создаётся при первом обращении и обновляется по user_version, так что
 * отдельного шага миграции при деплое нет: сервер поднялся — база готова.
 * Все JSON-поля (scenes, cost, draft, reference_analysis) лежат текстом,
 * чтение и запись идут через хелперы parseJson/stringify ниже.
 */

const SCHEMA: string[] = [
  // v1 — исходная схема после переезда с Supabase
  `
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id                 TEXT PRIMARY KEY,
    email              TEXT NOT NULL UNIQUE,
    status             TEXT NOT NULL DEFAULT 'pending',
    generations_limit  INTEGER NOT NULL DEFAULT 0,
    generations_used   INTEGER NOT NULL DEFAULT 0,
    elevenlabs_key_enc TEXT,
    session_epoch      INTEGER NOT NULL DEFAULT 1,
    note               TEXT,
    created_at         TEXT NOT NULL,
    approved_at        TEXT,
    registered_at      TEXT,
    last_login_at      TEXT
  );

  CREATE TABLE IF NOT EXISTS admins (
    email      TEXT PRIMARY KEY,
    added_by   TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS invite_codes (
    code       TEXT PRIMARY KEY,
    email      TEXT NOT NULL,
    created_by TEXT,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at    TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_invite_email ON invite_codes (email);

  CREATE TABLE IF NOT EXISTS login_codes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    email      TEXT NOT NULL,
    scope      TEXT NOT NULL,
    code_hash  TEXT NOT NULL,
    attempts   INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    consumed_at TEXT,
    ip         TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_login_codes_email ON login_codes (email, scope, created_at);

  CREATE TABLE IF NOT EXISTS login_attempts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ip         TEXT NOT NULL,
    kind       TEXT NOT NULL,
    success    INTEGER NOT NULL,
    email      TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_attempts_ip ON login_attempts (ip, kind, created_at);

  CREATE TABLE IF NOT EXISTS video_generations (
    id                      TEXT PRIMARY KEY,
    user_id                 TEXT NOT NULL,
    topic                   TEXT NOT NULL,
    genre                   TEXT,
    style                   TEXT,
    voice                   TEXT,
    status                  TEXT NOT NULL,
    target_duration_minutes INTEGER NOT NULL DEFAULT 0,
    actual_duration_seconds INTEGER NOT NULL DEFAULT 0,
    scenes                  TEXT,
    draft                   TEXT,
    cost                    TEXT,
    reference_url           TEXT,
    reference_analysis      TEXT,
    error_message           TEXT,
    media_purged_at         TEXT,
    created_at              TEXT NOT NULL,
    updated_at              TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_videos_user ON video_generations (user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_videos_status ON video_generations (status, created_at);
  `,
];

let handle: DatabaseSync | null = null;

/** Соединение переживает горячую перезагрузку в dev — иначе плодятся хэндлы. */
const cache = globalThis as unknown as { __studioDb?: DatabaseSync };

export function getDb(): DatabaseSync {
  if (handle) return handle;
  if (cache.__studioDb) {
    handle = cache.__studioDb;
    return handle;
  }

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");

  const current = Number((db.prepare("PRAGMA user_version").get() as any)?.user_version || 0);
  for (let v = current; v < SCHEMA.length; v++) {
    db.exec(SCHEMA[v]);
  }
  if (current < SCHEMA.length) db.exec(`PRAGMA user_version = ${SCHEMA.length}`);

  handle = db;
  cache.__studioDb = db;
  return db;
}

// ---------------------------------------------------------------------------
// Мелкие помощники
// ---------------------------------------------------------------------------

export type Row = Record<string, any>;

export function all<T = Row>(sql: string, ...params: any[]): T[] {
  return getDb().prepare(sql).all(...params) as T[];
}

export function get<T = Row>(sql: string, ...params: any[]): T | null {
  return (getDb().prepare(sql).get(...params) as T) ?? null;
}

export function run(sql: string, ...params: any[]): { changes: number } {
  const res = getDb().prepare(sql).run(...params);
  return { changes: Number(res.changes) };
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string" || !raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function toJson(value: unknown): string | null {
  return value === undefined || value === null ? null : JSON.stringify(value);
}

// ---------------------------------------------------------------------------
// settings: мелкие глобальные значения (эпоха админских сессий и т.п.)
// ---------------------------------------------------------------------------

export function getSetting(key: string): string | null {
  return get<{ value: string }>("SELECT value FROM settings WHERE key = ?", key)?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  run(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    key,
    value
  );
}
