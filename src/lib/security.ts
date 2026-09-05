import { NextRequest } from "next/server";
import { all, nowIso, run } from "./db";
import { normalizeOrientation, type Orientation } from "./orientation";
import { normalizeGenre, type GenreId } from "./content/genres";
import { normalizeLanguage, type ContentLanguage } from "./content/languages";
import { STYLES, type StyleId } from "./content/styles";
import { clampMinutes, MAX_MINUTES, MIN_MINUTES } from "./plan";

// ---------------------------------------------------------------------------
// Скользящее окно в памяти — защита кошелька OpenAI от лавины генераций
// ---------------------------------------------------------------------------

const ipLimits = new Map<string, number[]>();
const globalScriptTimestamps: number[] = [];

export function getClientIp(req: NextRequest): string {
  // За Cloudflare и nginx реальный адрес приходит в cf-connecting-ip.
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "127.0.0.1";
}

/** Ограничение на запуск сценариев: 4 за 10 минут с IP и 40 в час на всех. */
export function checkOpenAiRateLimit(ip: string): { allowed: boolean; error?: string } {
  const now = Date.now();
  const tenMinsAgo = now - 10 * 60 * 1000;
  const oneHourAgo = now - 60 * 60 * 1000;

  while (globalScriptTimestamps.length && globalScriptTimestamps[0] < oneHourAgo) {
    globalScriptTimestamps.shift();
  }
  if (globalScriptTimestamps.length >= 40) {
    return {
      allowed: false,
      error: "Сработал глобальный лимит безопасности OpenAI (макс. 40 историй в час). Подождите несколько минут.",
    };
  }

  const recent = (ipLimits.get(ip) || []).filter((t) => t > tenMinsAgo);
  if (recent.length >= 4) {
    return {
      allowed: false,
      error: "Сработал лимит защиты от спама: не более 4 генераций за 10 минут с одного IP.",
    };
  }

  recent.push(now);
  ipLimits.set(ip, recent);
  globalScriptTimestamps.push(now);
  if (ipLimits.size > 5000) ipLimits.clear();

  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Попытки входа — в базе: переживают перезапуск процесса
// ---------------------------------------------------------------------------

export type AttemptKind = "login" | "register" | "admin";

const ATTEMPT_LIMITS: Record<AttemptKind, { max: number; windowMs: number; label: string }> = {
  login: { max: 20, windowMs: 60 * 60 * 1000, label: "20 попыток за час" },
  register: { max: 10, windowMs: 60 * 60 * 1000, label: "10 попыток регистрации за час" },
  admin: { max: 10, windowMs: 60 * 60 * 1000, label: "10 попыток за час" },
};

export function checkAttempts(
  ip: string,
  kind: AttemptKind
): { blocked: boolean; attemptsLeft: number; max: number; label: string } {
  const limit = ATTEMPT_LIMITS[kind];
  const since = new Date(Date.now() - limit.windowMs).toISOString();
  const rows = all<{ n: number }>(
    "SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ? AND kind = ? AND success = 0 AND created_at >= ?",
    ip,
    kind,
    since
  );
  const failed = Number(rows[0]?.n) || 0;
  return {
    blocked: failed >= limit.max,
    attemptsLeft: Math.max(0, limit.max - failed),
    max: limit.max,
    label: limit.label,
  };
}

export function recordAttempt(ip: string, kind: AttemptKind, success: boolean, email?: string | null): void {
  run(
    "INSERT INTO login_attempts (ip, kind, success, email, created_at) VALUES (?, ?, ?, ?, ?)",
    ip,
    kind,
    success ? 1 : 0,
    email || null,
    nowIso()
  );
}

/** Уборка журнала попыток старше недели — вызывается уборщиком раз в сутки. */
export function purgeOldAttempts(): number {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  return run("DELETE FROM login_attempts WHERE created_at < ?", cutoff).changes;
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
