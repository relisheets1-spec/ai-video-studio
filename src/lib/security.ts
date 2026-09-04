import { NextRequest } from "next/server";

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

/**
 * Validates prompt and generation settings
 */
export function sanitizeScriptInput(data: any): {
  valid: boolean;
  error?: string;
  sanitized?: { topic: string; style: string; voice: string; targetMinutes: number };
} {
  const { topic, style, voice, targetMinutes } = data || {};

  if (!topic || typeof topic !== "string") {
    return { valid: false, error: "Укажите тему сюжета" };
  }

  const cleanTopic = topic.trim();
  if (cleanTopic.length < 5) {
    return { valid: false, error: "Сюжет слишком короткий (минимум 5 символов)" };
  }

  if (cleanTopic.length > 1500) {
    return { valid: false, error: "Сюжет слишком длинный (максимум 1500 символов для защиты токенов)" };
  }

  const validVoices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
  const chosenVoice = validVoices.includes(voice) ? voice : "onyx";

  const cleanStyle = typeof style === "string" ? style.slice(0, 100) : "cinematic photorealistic";
  const chosenMinutes = Number(targetMinutes) >= 10 ? 10 : 8;

  return {
    valid: true,
    sanitized: {
      topic: cleanTopic,
      style: cleanStyle,
      voice: chosenVoice,
      targetMinutes: chosenMinutes,
    },
  };
}
