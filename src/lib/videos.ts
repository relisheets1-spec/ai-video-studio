import crypto from "node:crypto";
import { ADMIN_EMAIL } from "./env";
import { all, get, nowIso, parseJson, run, toJson } from "./db";
import type { Scene, VideoCost, VideoGeneration } from "./types";

/**
 * Фильмы. В базе scenes / draft / cost / reference_analysis лежат текстом
 * (JSON), наружу уходят разобранными — форма записи та же, что была раньше.
 */

interface VideoRow {
  id: string;
  user_id: string;
  topic: string;
  genre: string | null;
  style: string | null;
  voice: string | null;
  status: VideoGeneration["status"];
  target_duration_minutes: number;
  actual_duration_seconds: number;
  scenes: string | null;
  draft: string | null;
  cost: string | null;
  reference_url: string | null;
  reference_analysis: string | null;
  error_message: string | null;
  media_purged_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface VideoRecord extends VideoGeneration {
  draft: any;
}

function toRecord(row: VideoRow): VideoRecord {
  return {
    id: row.id,
    user_id: row.user_id,
    topic: row.topic,
    genre: row.genre,
    style: row.style || "",
    voice: row.voice || "",
    status: row.status,
    target_duration_minutes: row.target_duration_minutes,
    actual_duration_seconds: row.actual_duration_seconds,
    scenes: parseJson<Scene[]>(row.scenes, []),
    draft: parseJson<any>(row.draft, null),
    cost: parseJson<VideoCost | null>(row.cost, null),
    reference_url: row.reference_url,
    reference_analysis: parseJson<any>(row.reference_analysis, null),
    error_message: row.error_message,
    media_purged_at: row.media_purged_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function createVideo(input: {
  userId: string;
  topic: string;
  genre: string;
  style: string;
  voice: string;
  targetMinutes: number;
  referenceUrl?: string | null;
  referenceAnalysis?: unknown;
}): string {
  const id = crypto.randomUUID();
  const now = nowIso();
  run(
    "INSERT INTO video_generations " +
      "(id, user_id, topic, genre, style, voice, status, target_duration_minutes, actual_duration_seconds, " +
      " scenes, draft, cost, reference_url, reference_analysis, created_at, updated_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, 'generating_script', ?, 0, '[]', NULL, NULL, ?, ?, ?, ?)",
    id,
    input.userId,
    input.topic,
    input.genre,
    input.style,
    input.voice,
    Math.round(input.targetMinutes),
    input.referenceUrl || null,
    toJson(input.referenceAnalysis ?? null),
    now,
    now
  );
  return id;
}

export function getVideo(id: string): VideoRecord | null {
  const row = get<VideoRow>("SELECT * FROM video_generations WHERE id = ?", id);
  return row ? toRecord(row) : null;
}

/** Чужой фильм не отдаём: владелец сверяется здесь, а не в каждом роуте. */
export function getOwnedVideo(id: string, userId: string): VideoRecord | null {
  const video = getVideo(id);
  return video && video.user_id === userId ? video : null;
}

type Patch = Partial<{
  status: VideoGeneration["status"];
  /** id стиля или фрагмент, который план истории вытащил из темы. */
  style: string;
  scenes: Scene[];
  draft: unknown;
  cost: unknown;
  actual_duration_seconds: number;
  error_message: string | null;
  media_purged_at: string | null;
}>;

const JSON_FIELDS = new Set(["scenes", "draft", "cost"]);

export function updateVideo(id: string, patch: Patch): void {
  const keys = Object.keys(patch) as (keyof Patch)[];
  if (keys.length === 0) return;
  const sets = keys.map((k) => k + " = ?").join(", ");
  const values = keys.map((k) => (JSON_FIELDS.has(k as string) ? toJson(patch[k]) : (patch[k] as any)));
  run("UPDATE video_generations SET " + sets + ", updated_at = ? WHERE id = ?", ...values, nowIso(), id);
}

export function listUserVideos(userId: string, limit = 50): VideoRecord[] {
  return all<VideoRow>(
    "SELECT * FROM video_generations WHERE user_id = ? AND status = 'completed' ORDER BY created_at DESC LIMIT ?",
    userId,
    limit
  ).map(toRecord);
}

export interface StudioStats {
  users: number;
  blocked: number;
  /** Созданных, но ещё никем не использованных кодов доступа. */
  freeCodes: number;
  videos: number;
  videos7d: number;
}

export function studioStats(): StudioStats {
  const one = (sql: string, ...params: any[]) => Number(get<{ n: number }>(sql, ...params)?.n) || 0;
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  return {
    users: one("SELECT COUNT(*) AS n FROM users WHERE email <> ? AND email NOT IN (SELECT email FROM admins)", ADMIN_EMAIL || ""),
    blocked: one(
      "SELECT COUNT(*) AS n FROM users WHERE status = 'blocked' AND email <> ? AND email NOT IN (SELECT email FROM admins)",
      ADMIN_EMAIL || ""
    ),
    freeCodes: one("SELECT COUNT(*) AS n FROM access_codes WHERE email IS NULL"),
    videos: one("SELECT COUNT(*) AS n FROM video_generations WHERE status = 'completed'"),
    videos7d: one(
      "SELECT COUNT(*) AS n FROM video_generations WHERE status = 'completed' AND created_at >= ?",
      weekAgo
    ),
  };
}

/** Все фильмы всех пользователей — для админской таблицы со стоимостью. */
export function listAllVideos(limit = 300): (VideoRecord & { email: string | null })[] {
  return all<VideoRow & { email: string | null }>(
    "SELECT v.*, u.email AS email FROM video_generations v LEFT JOIN users u ON u.id = v.user_id " +
      "WHERE v.status = 'completed' ORDER BY v.created_at DESC LIMIT ?",
    limit
  ).map((row) => ({ ...toRecord(row), email: row.email }));
}

/** Идентификаторы всех фильмов пользователя — нужны, чтобы стереть их файлы. */
export function userVideoIds(userId: string): string[] {
  return all<{ id: string }>("SELECT id FROM video_generations WHERE user_id = ?", userId).map((r) => r.id);
}
