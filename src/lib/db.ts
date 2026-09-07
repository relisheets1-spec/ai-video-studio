import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DB_PATH } from "./env";

/**
 * База: один файл SQLite (node:sqlite, без нативных зависимостей).
 *
 * Схема создаётся при первом обращении; её номер лежит в user_version, так что
 * отдельного шага миграции при деплое нет: сервер поднялся — база готова.
 * Все JSON-поля (scenes, cost, draft, reference_analysis) лежат текстом,
 * чтение и запись идут через хелперы parseJson/stringify ниже.
 */

/**
 * Номер схемы. Пустая база создаётся сразу в этой версии; база с другим
 * номером — ошибка, а не тихая порча данных.
 */
const SCHEMA_VERSION = 2;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- Пользователь появляется при первом входе по коду доступа.
  CREATE TABLE IF NOT EXISTS users (
    id                 TEXT PRIMARY KEY,
    email              TEXT NOT NULL UNIQUE,
    status             TEXT NOT NULL DEFAULT 'active',
    elevenlabs_key_enc TEXT,
    openai_key_enc     TEXT,
    session_epoch      INTEGER NOT NULL DEFAULT 1,
    created_at         TEXT NOT NULL,
    last_login_at      TEXT
  );

  -- Коды доступа: свободный код привязывается к почте при первом входе.
  CREATE TABLE IF NOT EXISTS access_codes (
    code       TEXT PRIMARY KEY,
    email      TEXT UNIQUE,
    note       TEXT,
    created_at TEXT NOT NULL,
    used_at    TEXT,
    revoked_at TEXT
  );

  -- Администраторы, добавленные из панели (главный — ADMIN_EMAIL из env).
  CREATE TABLE IF NOT EXISTS admins (
    email      TEXT PRIMARY KEY,
    added_by   TEXT,
    created_at TEXT NOT NULL
  );

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
`;

let handle: DatabaseSync | null = null;

/** Соединение переживает горячую перезагрузку в dev — иначе плодятся хэндлы. */
const cache = globalThis as unknown as { __studioDb?: DatabaseSync };

function getDb(): DatabaseSync {
  if (handle) return handle;
  if (cache.__studioDb) {
    handle = cache.__studioDb;
    return handle;
  }

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  // Каталог данных проходим для nginx (он отдаёт /media), сам файл базы —
  // только владельцу. WAL/SHM наследуют права основного файла, поэтому
  // chmod идёт до включения WAL. На Windows chmod ничего не меняет.
  try {
    fs.chmodSync(DB_PATH, 0o600);
  } catch {}
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");

  const current = Number((db.prepare("PRAGMA user_version").get() as any)?.user_version || 0);
  if (current === 0) {
    db.exec("BEGIN");
    try {
      db.exec(SCHEMA);
      db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  } else if (current !== SCHEMA_VERSION) {
    throw new Error(
      `База ${DB_PATH} схемы v${current}, приложение ждёт v${SCHEMA_VERSION}: ` +
        "восстановите копию нужной версии из /var/backups/studio или удалите файл (данные пропадут)."
    );
  }

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
