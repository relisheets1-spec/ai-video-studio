import { supabaseAdmin } from "./supabase";

/**
 * Временная заморозка аккаунта — колонка access_codes.frozen_until.
 * Проверяется при входе и в requireUser на каждом запросе к API.
 * «Бессрочно» хранится как далёкая дата, а не как infinity: PostgREST
 * отдаёт infinity строкой, которую new Date() не разбирает.
 */

export const FREEZE_FOREVER = "9999-12-31T00:00:00.000Z";

/** Момент окончания заморозки, если она действует прямо сейчас, иначе null. */
export function isFrozen(frozenUntil: string | null | undefined): Date | null {
  if (!frozenUntil) return null;
  const until = new Date(frozenUntil);
  if (Number.isNaN(until.getTime())) return null;
  return until.getTime() > Date.now() ? until : null;
}

export async function setFreeze(userId: string, hours: number | "forever"): Promise<void> {
  const value =
    hours === "forever" ? FREEZE_FOREVER : new Date(Date.now() + hours * 3600_000).toISOString();
  await supabaseAdmin.from("access_codes").update({ frozen_until: value }).eq("id", userId);
}

export async function clearFreeze(userId: string): Promise<void> {
  await supabaseAdmin.from("access_codes").update({ frozen_until: null }).eq("id", userId);
}

export function formatFreezeUntil(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  if (d.getUTCFullYear() >= 9999) return "бессрочно";
  return d.toLocaleString("ru-RU");
}
