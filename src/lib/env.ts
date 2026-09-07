import path from "node:path";

/**
 * Все настройки сервера в одном месте. Читается только на сервере
 * (роуты, скрипты) — в клиентские компоненты этот модуль не импортируется.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length < 5 || email.length > 254 || !EMAIL_RE.test(email)) return null;
  return email;
}

function str(name: string, fallback = ""): string {
  return (process.env[name] || "").trim() || fallback;
}

function int(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** Каталог с данными: база и медиа. На сервере — /var/lib/studio. */
const DATA_DIR = str("DATA_DIR", path.join(process.cwd(), ".data"));
export const DB_PATH = str("DB_PATH", path.join(DATA_DIR, "studio.db"));
export const MEDIA_ROOT = str("MEDIA_ROOT", path.join(DATA_DIR, "media"));

/** Внешний адрес сайта. */
const APP_URL = str("APP_URL", "http://localhost:3000").replace(/\/+$/, "");
/** Secure-cookie только за https: на голом http браузер такую cookie отбросит. */
export const COOKIE_SECURE = APP_URL.startsWith("https://");

/**
 * Единственный администратор: почта и scrypt-хэш его кода входа (сам код на
 * сервере не хранится; хэш делает `node scripts/hash-code.mjs "<код>"`).
 * Вход этой почтой ведёт сразу в панель, студии у администратора нет.
 */
export const ADMIN_EMAIL = normalizeEmail(str("ADMIN_EMAIL").split(/[,\s;]+/)[0]);
export const ADMIN_CODE_HASH = str("ADMIN_CODE_HASH");

/** Через сколько дней уборщик стирает картинки и звук (текст и стоимость остаются). */
export const MEDIA_TTL_DAYS = int("MEDIA_TTL_DAYS", 30);

/** Сколько устройств (живых сессий) может быть у одного пользователя; лишнее — самое давнее — выходит. */
export const MAX_SESSIONS = int("MAX_SESSIONS", 3);
