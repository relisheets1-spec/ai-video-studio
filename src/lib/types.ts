import type { Orientation } from "./orientation";
import type { VideoCost } from "./pricing";

export type { Orientation, VideoCost };

/**
 * Жизненный цикл инвайт-кода:
 *   invited  — код создан админом, никем не занят;
 *   pending  — пользователь зарегистрировался (почта + ключ), ждёт одобрения;
 *   approved — доступ открыт;
 *   rejected / blocked — доступ закрыт админом.
 */
export type AccessStatus = "invited" | "pending" | "approved" | "rejected" | "blocked";

/** Строка access_codes в том виде, в каком её видит админка. Ключ ElevenLabs наружу не отдаётся. */
export interface AccessCode {
  id: string;
  user_name: string;
  secret_code: string;
  email: string | null;
  status: AccessStatus;
  generations_limit: number;
  generations_used: number;
  created_at: string;
  approved_at?: string | null;
  claimed_at?: string | null;
  frozen_until?: string | null;
  has_elevenlabs_key?: boolean;
}

/** Полная серверная строка — только внутри API-роутов. */
export interface AccessCodeRow extends Omit<AccessCode, "has_elevenlabs_key"> {
  elevenlabs_key_enc?: string | null;
}

/** Профиль, который получает клиент студии. */
export interface StudioUser {
  id: string;
  email: string;
  userName: string;
  status: AccessStatus;
  remaining: number;
  generationsLimit: number;
  generationsUsed: number;
  hasElevenLabsKey: boolean;
}

export interface AdminInfo {
  email: string;
  isPrimary: boolean;
  appointedBy?: string | null;
  createdAt?: string | null;
}

export interface Scene {
  id: number;
  title: string;
  narration: string; // The spoken text
  visualPrompt: string; // The prompt for the image model
  audioUrl?: string; // Supabase public URL of audio MP3
  imageUrl?: string; // Supabase public URL of generated image
  durationEstimate?: number; // Serverside guess, used only until audio metadata loads
  actualDuration?: number; // Measured length of the decoded MP3
  /**
   * Ориентация кадра. Хранится ВНУТРИ scenes jsonb: так исторически сложилось,
   * и старые видео поля не имеют — читаются как "landscape", что для них верно.
   */
  orientation?: Orientation;
}

export interface VideoGeneration {
  id: string;
  user_id: string;
  topic: string;
  genre?: string;
  style: string;
  voice: string;
  status: "draft" | "generating_script" | "generating_audio" | "generating_images" | "completed" | "failed";
  target_duration_minutes: number;
  actual_duration_seconds: number;
  scenes: Scene[];
  error_message?: string | null;
  /** Фактическая стоимость (с сентября 2026); у старых видео отсутствует. */
  cost?: VideoCost | null;
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
  | "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer"
  | string;

export interface GenerationProgress {
  step: "idle" | "script" | "audio" | "images" | "ready";
  currentScene: number;
  totalScenes: number;
  percent: number;
  message: string;
}
