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
  visualPrompt: string; // The prompt for DALL-E
  audioUrl?: string; // Supabase public URL of audio MP3
  imageUrl?: string; // Supabase public URL of generated image
  durationEstimate?: number; // Estimated seconds (e.g. 25-30s)
  actualDuration?: number;
}

export interface VideoGeneration {
  id: string;
  user_id: string;
  topic: string;
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

export type VoiceOption = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";

export interface GenerationProgress {
  step: "idle" | "script" | "audio" | "images" | "ready";
  currentScene: number;
  totalScenes: number;
  percent: number;
  message: string;
}
