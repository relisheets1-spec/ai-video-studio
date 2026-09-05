import type { Orientation } from "./orientation";

export type { Orientation };

export interface AccessCode {
  id: string;
  user_name: string;
  secret_code: string;
  status: "pending" | "approved" | "rejected" | "blocked";
  generations_limit: number;
  generations_used: number;
  created_at: string;
  approved_at?: string | null;
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
   * Ориентация кадра. Хранится ВНУТРИ scenes jsonb, а не отдельной колонкой:
   * в репозитории нет миграций, схема заведена руками, и вставка с
   * несуществующей колонкой уронила бы каждую генерацию.
   * Старые видео поля не имеют — читаются как "landscape", что для них верно.
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
