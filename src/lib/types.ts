import type { Orientation } from "./orientation";
import type { VideoCost } from "./pricing";

export type { Orientation, VideoCost };

/**
 * Жизненный цикл доступа:
 *   pending  — заявка подана, ждёт администратора;
 *   invited  — админ одобрил, выдан код приглашения, регистрация не завершена;
 *   approved — доступ открыт, вход по коду с почты;
 *   rejected — заявка отклонена;
 *   blocked  — доступ закрыт, все сессии погашены.
 */
export type AccessStatus = "pending" | "invited" | "approved" | "rejected" | "blocked";

/** Профиль, который получает клиент студии. Ключ ElevenLabs наружу не отдаётся. */
export interface StudioUser {
  id: string;
  email: string;
  status: AccessStatus;
  remaining: number;
  generationsLimit: number;
  generationsUsed: number;
  hasElevenLabsKey: boolean;
}

/** Строка таблицы пользователей в админке: плюс даты, счётчик фильмов и код приглашения. */
export interface AdminUserView extends StudioUser {
  createdAt: string;
  approvedAt: string | null;
  registeredAt: string | null;
  lastLoginAt: string | null;
  videosCount: number;
  invite: { code: string; expiresAt: string; usedAt: string | null } | null;
}

export interface AdminInfo {
  email: string;
  /** Из ADMIN_EMAILS: такого админа нельзя снять из панели. */
  isPrimary: boolean;
  addedBy?: string | null;
  createdAt?: string | null;
}

export interface Scene {
  id: number;
  title: string;
  narration: string;
  visualPrompt: string;
  /** Ссылка вида /media/films/<videoId>/scene_1.mp3 */
  audioUrl?: string;
  /** Ссылка вида /media/films/<videoId>/scene_1.png */
  imageUrl?: string;
  durationEstimate?: number;
  actualDuration?: number;
  /**
   * Ориентация кадра. Хранится ВНУТРИ scenes: так исторически сложилось,
   * и старые видео поля не имеют — читаются как "landscape", что для них верно.
   */
  orientation?: Orientation;
}

export interface VideoGeneration {
  id: string;
  user_id: string;
  topic: string;
  genre?: string | null;
  style: string;
  voice: string;
  status: "draft" | "generating_script" | "generating_audio" | "generating_images" | "completed" | "failed";
  target_duration_minutes: number;
  actual_duration_seconds: number;
  scenes: Scene[];
  error_message?: string | null;
  cost?: VideoCost | null;
  /** Референс персонажа/объекта, если фильм делался по картинке пользователя. */
  reference_url?: string | null;
  reference_analysis?: { summary?: string; subjectPrompt?: string; stylePrompt?: string } | null;
  /** Когда уборщик стёр картинки и звук; текст сцен и стоимость остаются. */
  media_purged_at?: string | null;
  created_at: string;
  updated_at: string;
}

export type VoiceOption =
  | "s0phbFBBp708ZeIy8oGx" // Arcadays
  | "Jhqrj1kYppTq06Kj3KFa" // Mishki
  | "nPczCjzI2devNBz1zQrb" // Brian
  | "JBFqnCBsd6RMkjVDRZzb" // George
  | "EXAVITQu4vr4xnSDxMaL" // Sarah
  | "pNInz6obpgDQGcFmaJgB" // Adam
  | string;

export interface GenerationProgress {
  step: "idle" | "script" | "audio" | "images" | "ready";
  currentScene: number;
  totalScenes: number;
  percent: number;
  message: string;
}
