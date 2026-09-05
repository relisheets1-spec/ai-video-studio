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

export const IS_PROD = process.env.NODE_ENV === "production";

/** Каталог с данными: база и медиа. На сервере — /var/lib/studio. */
export const DATA_DIR = str("DATA_DIR", path.join(process.cwd(), ".data"));
export const DB_PATH = str("DB_PATH", path.join(DATA_DIR, "studio.db"));
export const MEDIA_ROOT = str("MEDIA_ROOT", path.join(DATA_DIR, "media"));

/** Внешний адрес сайта — нужен для ссылок в письмах. */
export const APP_URL = str("APP_URL", "http://localhost:3000").replace(/\/+$/, "");
export const APP_NAME = str("APP_NAME", "AI Video Studio");

/** Стартовые администраторы. Их нельзя снять из панели. */
export const ADMIN_EMAILS: string[] = str("ADMIN_EMAILS")
  .split(/[,\s;]+/)
  .map((e) => normalizeEmail(e))
  .filter((e): e is string => !!e);

/** Заглушка сайта: пока задан пароль, формы входа закрыты общим экраном. */
export const SITE_PASSWORD = str("SITE_PASSWORD");

/** Сколько генераций получает пользователь при одобрении заявки. */
export const DEFAULT_GENERATION_LIMIT = int("DEFAULT_GENERATION_LIMIT", 5);

/** Через сколько дней уборщик стирает картинки и звук (текст и стоимость остаются). */
export const MEDIA_TTL_DAYS = int("MEDIA_TTL_DAYS", 30);

/** Почта. Пусто — письма пишутся в журнал сервера (режим разработки). */
export const MAIL_FROM = str("MAIL_FROM", "AI Video Studio <no-reply@localhost>");
export const RESEND_API_KEY = str("RESEND_API_KEY");
export const SMTP_HOST = str("SMTP_HOST");
export const SMTP_PORT = int("SMTP_PORT", 587);
export const SMTP_USER = str("SMTP_USER");
export const SMTP_PASSWORD = str("SMTP_PASSWORD");
export const SMTP_SECURE = str("SMTP_SECURE") === "1";

export const OPENAI_API_KEY = str("OPENAI_API_KEY");
/** Запасной ключ ElevenLabs владельца; у каждого пользователя свой. */
export const ELEVENLABS_API_KEY = str("ELEVENLABS_API_KEY");
