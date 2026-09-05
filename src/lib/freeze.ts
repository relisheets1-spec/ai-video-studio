import { supabaseAdmin } from "./supabase";

/**
 * Временная заморозка аккаунта.
 *
 * Статус "blocked" в access_codes уже проверялся при входе, но ни одно
 * действие админки его не выставляло, и срока у блокировки не было вовсе.
 *
 * Срок хранится в system_settings (key/value), а не отдельной колонкой:
 * DDL к этой базе из репозитория недоступен — direct-хост Supabase больше не
 * резолвится, а management API закрыт. Готовый ALTER TABLE лежит в
 * supabase/migrations/0001; после его применения этот модуль можно перевести
 * на колонку access_codes.frozen_until без изменений в вызывающем коде.
 */

const KEY_PREFIX = "freeze:";

export function freezeKey(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

/** Возвращает момент окончания заморозки или null. Просроченные чистит сама. */
export async function getFreezeUntil(userId: string): Promise<Date | null> {
  const { data } = await supabaseAdmin
    .from("system_settings")
    .select("value")
    .eq("key", freezeKey(userId))
    .maybeSingle();

  if (!data?.value) return null;

  // "forever" — бессрочная заморозка без даты снятия.
  if (data.value === "forever") return new Date(8640000000000000);

  const until = new Date(data.value);
  if (Number.isNaN(until.getTime())) return null;
  if (until.getTime() <= Date.now()) {
    await clearFreeze(userId);
    return null;
  }
  return until;
}

export async function setFreeze(userId: string, hours: number | "forever"): Promise<void> {
  const value =
    hours === "forever" ? "forever" : new Date(Date.now() + hours * 3600_000).toISOString();

  await supabaseAdmin
    .from("system_settings")
    .upsert({ key: freezeKey(userId), value }, { onConflict: "key" });
}

export async function clearFreeze(userId: string): Promise<void> {
  await supabaseAdmin.from("system_settings").delete().eq("key", freezeKey(userId));
}

/** Все активные заморозки одним запросом — для списка пользователей в админке. */
export async function listFreezes(): Promise<Record<string, string>> {
  const { data } = await supabaseAdmin
    .from("system_settings")
    .select("key, value")
    .like("key", `${KEY_PREFIX}%`);

  const out: Record<string, string> = {};
  for (const row of data || []) {
    out[String(row.key).slice(KEY_PREFIX.length)] = String(row.value);
  }
  return out;
}

export function formatFreezeUntil(value: string): string {
  if (value === "forever") return "бессрочно";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString("ru-RU");
}
