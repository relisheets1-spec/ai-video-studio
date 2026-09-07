import type { Orientation } from "./orientation";
import type { VideoCost } from "./pricing";

export type { VideoCost };

/** active — работает; blocked — доступ закрыт администратором, сессии погашены. */
export type AccessStatus = "active" | "blocked";

/** Профиль, который получает клиент студии. Сами ключи наружу не отдаются. */
export interface StudioUser {
  id: string;
  email: string;
  status: AccessStatus;
  hasElevenLabsKey: boolean;
  hasOpenAiKey: boolean;
}

/** Администратор: главный — из настроек сервера, остальные добавлены из панели. */
export interface AdminInfo {
  email: string;
  isPrimary: boolean;
  addedBy: string | null;
  createdAt: string | null;
}

/** Строка таблицы пользователей в админке. */
export interface AdminUserView extends StudioUser {
  createdAt: string;
  lastLoginAt: string | null;
  videosCount: number;
  /** Сколько устройств (живых сессий) сейчас у пользователя. */
  devices: number;
  /** Действующий код доступа этой почты. */
  code: string | null;
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
  /** Фактическая стоимость — видна только администратору. */
  cost?: VideoCost | null;
  /** Референс персонажа/объекта, если фильм делался по картинке пользователя. */
  reference_url?: string | null;
  reference_analysis?: { summary?: string; stylePrompt?: string; mood?: string; subjectPrompt?: string } | null;
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

