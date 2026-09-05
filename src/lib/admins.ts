import { supabaseAdmin } from "./supabase";
import { hashPassword, verifyPassword } from "./password";
import { safeEqualString } from "./crypto";
import type { AdminInfo } from "./types";

/**
 * Администраторы.
 *
 * Основной администратор задаётся переменной ADMIN_EMAIL и дублируется в
 * таблице admins с is_primary = true. Остальных назначает только основной.
 * Пароль один на всех админов (system_settings.admin_password_hash); при его
 * смене растёт admin_session_epoch, и все выданные админ-токены гаснут.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length < 5 || email.length > 254 || !EMAIL_RE.test(email)) return null;
  return email;
}

export function primaryAdminEmail(): string | null {
  return normalizeEmail(process.env.ADMIN_EMAIL);
}

/** Держит запись основного админа в таблице в согласии с ADMIN_EMAIL. */
export async function ensurePrimarySeeded(): Promise<void> {
  const primary = primaryAdminEmail();
  if (!primary) return;
  await supabaseAdmin.from("admins").update({ is_primary: false }).eq("is_primary", true).neq("email", primary);
  await supabaseAdmin.from("admins").upsert({ email: primary, is_primary: true }, { onConflict: "email" });
}

function toInfo(row: any, primary: string | null): AdminInfo {
  return {
    email: row.email,
    isPrimary: primary ? row.email === primary : !!row.is_primary,
    appointedBy: row.appointed_by ?? null,
    createdAt: row.created_at ?? null,
  };
}

export async function getAdmin(email: string): Promise<AdminInfo | null> {
  const primary = primaryAdminEmail();
  if (primary && email === primary) return { email, isPrimary: true };
  const { data } = await supabaseAdmin
    .from("admins")
    .select("email, is_primary, appointed_by, created_at")
    .eq("email", email)
    .maybeSingle();
  return data ? toInfo(data, primary) : null;
}

export async function listAdmins(): Promise<AdminInfo[]> {
  const primary = primaryAdminEmail();
  const { data } = await supabaseAdmin
    .from("admins")
    .select("email, is_primary, appointed_by, created_at")
    .order("created_at", { ascending: true });
  const list = (data || []).map((row) => toInfo(row, primary));
  if (primary && !list.some((a) => a.email === primary)) {
    list.unshift({ email: primary, isPrimary: true });
  }
  return list.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
}

export type AdminOpResult = { ok: true } | { ok: false; error: string; status: number };

export async function addAdmin(email: string, appointedBy: string): Promise<AdminOpResult> {
  if (await getAdmin(email)) {
    return { ok: false, error: "Этот адрес уже администратор", status: 409 };
  }
  const { error } = await supabaseAdmin
    .from("admins")
    .insert({ email, is_primary: false, appointed_by: appointedBy });
  if (error) return { ok: false, error: error.message, status: 500 };
  return { ok: true };
}

export async function removeAdmin(email: string): Promise<AdminOpResult> {
  const info = await getAdmin(email);
  if (!info) return { ok: false, error: "Администратор не найден", status: 404 };
  if (info.isPrimary) {
    return { ok: false, error: "Основного администратора удалить нельзя", status: 400 };
  }
  const { error } = await supabaseAdmin.from("admins").delete().eq("email", email);
  if (error) return { ok: false, error: error.message, status: 500 };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Эпоха сессий и пароль
// ---------------------------------------------------------------------------

const EPOCH_KEY = "admin_session_epoch";
const HASH_KEY = "admin_password_hash";
const LEGACY_KEY = "master_password";
const LEGACY_DEFAULT = "1599";
/** Пароль всё ещё стандартный, хоть и захэширован — подсказка сменить его. */
const DEFAULT_FLAG_KEY = "admin_password_is_default";

async function readSetting(key: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from("system_settings").select("value").eq("key", key).maybeSingle();
  return data?.value ?? null;
}

async function writeSetting(key: string, value: string): Promise<void> {
  await supabaseAdmin.from("system_settings").upsert({ key, value }, { onConflict: "key" });
}

export async function getAdminEpoch(): Promise<number> {
  const raw = await readSetting(EPOCH_KEY);
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export async function bumpAdminEpoch(): Promise<number> {
  const next = (await getAdminEpoch()) + 1;
  await writeSetting(EPOCH_KEY, String(next));
  return next;
}

/** Пароль ещё ни разу не менялся — в интерфейсе стоит подсказать сменить. */
export async function passwordIsDefault(): Promise<boolean> {
  if (await readSetting(HASH_KEY)) return (await readSetting(DEFAULT_FLAG_KEY)) === "1";
  const legacy = await readSetting(LEGACY_KEY);
  return !legacy || legacy === LEGACY_DEFAULT;
}

/**
 * Проверка с ленивым апгрейдом: пока хэша нет, сравниваем с прежним
 * plaintext-паролем из system_settings и при успехе сразу сохраняем хэш.
 */
export async function verifyAdminPassword(plain: string): Promise<boolean> {
  const hash = await readSetting(HASH_KEY);
  if (hash) return verifyPassword(plain, hash);

  const legacy = (await readSetting(LEGACY_KEY)) || LEGACY_DEFAULT;
  if (!safeEqualString(plain, legacy)) return false;

  await writeSetting(HASH_KEY, hashPassword(plain));
  await supabaseAdmin.from("system_settings").delete().eq("key", LEGACY_KEY);
  if (plain === LEGACY_DEFAULT) await writeSetting(DEFAULT_FLAG_KEY, "1");
  return true;
}

export async function setAdminPassword(plain: string): Promise<number> {
  await writeSetting(HASH_KEY, hashPassword(plain));
  await supabaseAdmin.from("system_settings").delete().eq("key", LEGACY_KEY);
  await supabaseAdmin.from("system_settings").delete().eq("key", DEFAULT_FLAG_KEY);
  return bumpAdminEpoch();
}
