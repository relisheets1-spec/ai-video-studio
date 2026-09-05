import { NextRequest } from "next/server";
import { supabaseAdmin } from "./supabase";
import { normalizeOrientation, type Orientation } from "./orientation";
import { normalizeGenre, type GenreId } from "./content/genres";
import { normalizeLanguage, type ContentLanguage } from "./content/languages";
import { STYLES, type StyleId } from "./content/styles";
import { clampMinutes, MAX_MINUTES, MIN_MINUTES } from "./plan";

// In-memory sliding window rate-limiter
interface RateLimitEntry {
  timestamps: number[];
}

const ipLimits = new Map<string, RateLimitEntry>();
const globalScriptTimestamps: number[] = [];

// Cleanup stale entries every 15 minutes
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    const tenMinsAgo = now - 10 * 60 * 1000;

    ipLimits.forEach((val, key) => {
      val.timestamps = val.timestamps.filter((t) => t > tenMinsAgo);
      if (val.timestamps.length === 0) {
        ipLimits.delete(key);
      }
    });
  }, 15 * 60 * 1000);
}

export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "127.0.0.1";
}

/**
 * Enforces per-IP and global safety limits to prevent runaway OpenAI billing
 */
export function checkOpenAiRateLimit(ip: string): { allowed: boolean; error?: string } {
  const now = Date.now();
  const tenMinsAgo = now - 10 * 60 * 1000;
  const oneHourAgo = now - 60 * 60 * 1000;

  // Global safety cap: max 40 script generations per hour across all visitors
  const recentGlobal = globalScriptTimestamps.filter((t) => t > oneHourAgo);
  if (recentGlobal.length >= 40) {
    return {
      allowed: false,
      error: "Сработал глобальный лимит безопасности OpenAI (макс. 40 историй в час). Подождите несколько минут.",
    };
  }

  // Per-IP limit: max 4 script generations per 10 minutes
  let entry = ipLimits.get(ip);
  if (!entry) {
    entry = { timestamps: [] };
    ipLimits.set(ip, entry);
  }

  entry.timestamps = entry.timestamps.filter((t) => t > tenMinsAgo);

  if (entry.timestamps.length >= 4) {
    return {
      allowed: false,
      error: "Сработал лимит защиты от спама: не более 4 генераций за 10 минут с одного IP.",
    };
  }

  entry.timestamps.push(now);
  globalScriptTimestamps.push(now);

  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Лимиты попыток входа/регистрации — в БД (login_attempts), поэтому
// переживают холодные старты на Vercel в отличие от in-memory счётчика выше.
// ---------------------------------------------------------------------------

export type AttemptKind = "login" | "register" | "admin";

const ATTEMPT_LIMITS: Record<AttemptKind, { max: number; windowMs: number; label: string }> = {
  login: { max: 10, windowMs: 24 * 60 * 60 * 1000, label: "10 неверных попыток за сутки" },
  register: { max: 5, windowMs: 60 * 60 * 1000, label: "5 неудачных регистраций за час" },
  admin: { max: 10, windowMs: 24 * 60 * 60 * 1000, label: "10 неверных попыток за сутки" },
};

export async function checkAttempts(
  ip: string,
  kind: AttemptKind
): Promise<{ blocked: boolean; attemptsLeft: number; max: number; label: string }> {
  const limit = ATTEMPT_LIMITS[kind];
  const since = new Date(Date.now() - limit.windowMs).toISOString();
  const { count } = await supabaseAdmin
    .from("login_attempts")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .eq("kind", kind)
    .eq("success", false)
    .gte("created_at", since);
  const failed = count || 0;
  return {
    blocked: failed >= limit.max,
    attemptsLeft: Math.max(0, limit.max - failed),
    max: limit.max,
    label: limit.label,
  };
}

export async function recordAttempt(
  ip: string,
  kind: AttemptKind,
  success: boolean,
  email?: string | null
): Promise<void> {
  await supabaseAdmin.from("login_attempts").insert({ ip, kind, success, email: email || null });
}

/**
 * Validates prompt and generation settings
 */
export function sanitizeScriptInput(data: any): {
  valid: boolean;
  error?: string;
  sanitized?: {
    topic: string;
    genre: GenreId;
    style: string;
    voice: string;
    targetMinutes: number;
    language: ContentLanguage;
    orientation: Orientation;
  };
} {
  const { topic, genre, style, voice, targetMinutes, language, orientation } = data || {};

  if (!topic || typeof topic !== "string") {
    return { valid: false, error: "Укажите тему сюжета" };
  }

  const cleanTopic = topic.trim();
  if (cleanTopic.length < 5) {
    return { valid: false, error: "Сюжет слишком короткий (минимум 5 символов)" };
  }

  if (cleanTopic.length > 2000) {
    return { valid: false, error: "Сюжет слишком длинный (максимум 2000 символов)" };
  }

  const cleanGenre = normalizeGenre(genre);
  const chosenVoice = typeof voice === "string" && voice.length > 0 ? voice.slice(0, 80) : "";
  // id стиля или — для записей из архива — уже готовый английский фрагмент промпта
  const cleanStyle =
    typeof style === "string" && style.length > 0
      ? (STYLES[style as StyleId] ? style : style.slice(0, 120))
      : "cinematic";
  const chosenLang = normalizeLanguage(language);
  const chosenOrientation = normalizeOrientation(orientation);

  // Хронометраж обязателен: по ТЗ значения по умолчанию нет, пользователь
  // выбирает его сам. Правило дублируется на сервере, а не только в UI.
  const numMinutes = Number(targetMinutes);
  if (!Number.isFinite(numMinutes) || numMinutes <= 0) {
    return { valid: false, error: `Выберите хронометраж: от ${MIN_MINUTES} до ${MAX_MINUTES} минут` };
  }
  const chosenMinutes = clampMinutes(numMinutes);

  return {
    valid: true,
    sanitized: {
      topic: cleanTopic,
      genre: cleanGenre,
      style: cleanStyle,
      voice: chosenVoice,
      targetMinutes: chosenMinutes,
      language: chosenLang,
      orientation: chosenOrientation,
    },
  };
}
