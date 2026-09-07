#!/usr/bin/env node
/**
 * Уборщик диска. Запускается таймером systemd раз в сутки:
 *
 *   node scripts/cleanup.mjs [--dry]
 *
 * Что делает:
 *   1) стирает картинки и звук фильмов старше MEDIA_TTL_DAYS (30 по умолчанию);
 *      текст сцен, стоимость и вся статистика остаются в базе навсегда;
 *   2) удаляет папки фильмов, которых уже нет в базе (осиротевшие);
 *   3) стирает референсы старше суток — они нужны только во время генерации;
 *   4) чистит журнал попыток входа старше недели и сессии старше 30 дней.
 *
 * Зависимостей нет: node:sqlite и node:fs. Переменные берутся из окружения
 * (systemd подставляет /etc/studio.env).
 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const DRY = process.argv.includes("--dry");
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), ".data");
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, "studio.db");
const MEDIA_ROOT = process.env.MEDIA_ROOT || path.join(DATA_DIR, "media");
const TTL_DAYS = Number(process.env.MEDIA_TTL_DAYS) > 0 ? Number(process.env.MEDIA_TTL_DAYS) : 30;

const FILMS_DIR = path.join(MEDIA_ROOT, "films");

function log(...args) {
  console.info(`[cleanup]`, ...args);
}

function dirSize(dir) {
  let bytes = 0;
  for (const file of fs.readdirSync(dir)) {
    try {
      bytes += fs.statSync(path.join(dir, file)).size;
    } catch {
      // файл исчез между чтением каталога и статом
    }
  }
  return bytes;
}

function removeFilm(id) {
  const dir = path.join(FILMS_DIR, id);
  if (!fs.existsSync(dir)) return 0;
  const bytes = dirSize(dir);
  if (!DRY) fs.rmSync(dir, { recursive: true, force: true });
  return bytes;
}

if (!fs.existsSync(DB_PATH)) {
  log(`база ${DB_PATH} не найдена — работать не с чем`);
  process.exit(0);
}

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA busy_timeout = 10000");

const cutoff = new Date(Date.now() - TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
const now = new Date().toISOString();
let freed = 0;

// 1. Медиа фильмов старше срока
const old = db
  .prepare("SELECT id FROM video_generations WHERE media_purged_at IS NULL AND created_at < ?")
  .all(cutoff);
for (const row of old) {
  freed += removeFilm(row.id);
  if (!DRY) db.prepare("UPDATE video_generations SET media_purged_at = ? WHERE id = ?").run(now, row.id);
}
log(`фильмов старше ${TTL_DAYS} дней: ${old.length}`);

// 2. Осиротевшие папки
if (fs.existsSync(FILMS_DIR)) {
  const known = new Set(db.prepare("SELECT id FROM video_generations").all().map((r) => r.id));
  let orphans = 0;
  for (const entry of fs.readdirSync(FILMS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory() || known.has(entry.name)) continue;
    freed += removeFilm(entry.name);
    orphans++;
  }
  log(`осиротевших папок: ${orphans}`);
}

// 3. Референсы: нужны только пока идёт генерация (окно два часа)
const REFS_DIR = path.join(MEDIA_ROOT, "refs");
if (fs.existsSync(REFS_DIR)) {
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  let refs = 0;
  for (const userDir of fs.readdirSync(REFS_DIR, { withFileTypes: true })) {
    if (!userDir.isDirectory()) continue;
    const dir = path.join(REFS_DIR, userDir.name);
    for (const file of fs.readdirSync(dir)) {
      const full = path.join(dir, file);
      try {
        const st = fs.statSync(full);
        if (st.mtimeMs < dayAgo) {
          freed += st.size;
          if (!DRY) fs.unlinkSync(full);
          refs++;
        }
      } catch {
        // файл исчез между чтением каталога и статом
      }
    }
    if (!DRY && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
  }
  log(`референсов старше суток: ${refs}`);
}

// 4. Журнал попыток входа
if (!DRY) {
  const week = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const attempts = db.prepare("DELETE FROM login_attempts WHERE created_at < ?").run(week).changes;
  const month = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sessions = db.prepare("DELETE FROM sessions WHERE last_seen_at < ?").run(month).changes;
  log(`попытки входа старше недели: ${attempts}, сессии старше месяца: ${sessions}`);
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  db.exec("VACUUM");
}

log(`освобождено ${(freed / 1024 ** 2).toFixed(1)} МБ${DRY ? " (пробный прогон, ничего не удалено)" : ""}`);
db.close();
