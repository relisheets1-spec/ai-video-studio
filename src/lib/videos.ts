import crypto from "node:crypto";
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

export interface AdminLogRow {
  id: string;
  userId: string;
  email: string | null;
  topic: string;
  status: string;
  stale: boolean;
  message: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Упавшие и зависшие генерации для журнала в админке. */
export function listProblemVideos(limit = 100): AdminLogRow[] {
  const rows = all<VideoRow & { email: string | null }>(
    "SELECT v.*, u.email AS email FROM video_generations v " +
      "LEFT JOIN users u ON u.id = v.user_id " +
      "WHERE v.status IN ('failed', 'generating_script', 'generating_audio', 'generating_images') " +
      "ORDER BY v.created_at DESC LIMIT ?",
    limit
  );
  const staleCutoff = Date.now() - 2 * 60 * 60 * 1000;
  return rows
    .map((row) => {
      const stale = row.status !== "failed" && Date.parse(row.created_at) < staleCutoff;
      return {
        id: row.id,
        userId: row.user_id,
        email: row.email,
        topic: row.topic,
        status: row.status,
        stale,
        message: row.error_message || (stale ? "Генерация прервана и не завершилась" : null),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    })
    .filter((row) => row.status === "failed" || row.stale);
}

export interface StudioStats {
  users: number;
  pending: number;
  approved: number;
  videos: number;
  videos7d: number;
}

export function studioStats(): StudioStats {
  const one = (sql: string, ...params: any[]) => Number(get<{ n: number }>(sql, ...params)?.n) || 0;
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  return {
    users: one("SELECT COUNT(*) AS n FROM users"),
    pending: one("SELECT COUNT(*) AS n FROM users WHERE status = 'pending'"),
    approved: one("SELECT COUNT(*) AS n FROM users WHERE status = 'approved'"),
    videos: one("SELECT COUNT(*) AS n FROM video_generations WHERE status = 'completed'"),
    videos7d: one(
      "SELECT COUNT(*) AS n FROM video_generations WHERE status = 'completed' AND created_at >= ?",
      weekAgo
    ),
  };
}

/** Фильмы, у которых пора стереть картинки и звук. */
export function videosWithOldMedia(olderThanDays: number): { id: string }[] {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
  return all<{ id: string }>(
    "SELECT id FROM video_generations WHERE media_purged_at IS NULL AND created_at < ?",
    cutoff
  );
}

export function markMediaPurged(id: string): void {
  run("UPDATE video_generations SET media_purged_at = ? WHERE id = ?", nowIso(), id);
}

/** Идентификаторы всех фильмов пользователя — нужны, чтобы стереть их файлы. */
export function userVideoIds(userId: string): string[] {
  return all<{ id: string }>("SELECT id FROM video_generations WHERE user_id = ?", userId).map((r) => r.id);
}
