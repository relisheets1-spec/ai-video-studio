import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "./supabase";
import { signToken, verifyToken } from "./crypto";
import { formatFreezeUntil, isFrozen } from "./freeze";
import type { AccessCodeRow, AccessStatus, StudioUser } from "./types";

/**
 * Сессия пользователя студии.
 *
 * Токен подписан HMAC и живёт 30 дней, но сам по себе доступа не даёт: на
 * каждом запросе requireUser перечитывает строку пользователя и заново
 * проверяет статус и заморозку. Одобрение, отказ, заморозка и удаление
 * вступают в силу на следующем же запросе.
 */

const PREFIX = "sv2.";
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface UserSessionPayload {
  sub: string;
  iat: number;
  exp: number;
}

export const USER_COLUMNS =
  "id, user_name, secret_code, email, status, generations_limit, generations_used, " +
  "created_at, approved_at, claimed_at, frozen_until, elevenlabs_key_enc";

export function signUserToken(userId: string): string {
  const now = Date.now();
  return signToken(PREFIX, "user-session", { sub: userId, iat: now, exp: now + TTL_MS });
}

export function verifyUserToken(token: string | null | undefined): UserSessionPayload | null {
  const payload = verifyToken<UserSessionPayload>(token, PREFIX, "user-session");
  return payload && typeof payload.sub === "string" && payload.sub ? payload : null;
}

export function bearerFrom(req: NextRequest): string | null {
  const header = req.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
}

export function toPublicUser(row: AccessCodeRow): StudioUser {
  const limit = row.generations_limit || 0;
  const used = row.generations_used || 0;
  return {
    id: row.id,
    email: row.email || "",
    userName: row.user_name,
    status: row.status,
    remaining: Math.max(0, limit - used),
    generationsLimit: limit,
    generationsUsed: used,
    hasElevenLabsKey: !!row.elevenlabs_key_enc,
  };
}

export function statusMessage(status: AccessStatus): string {
  switch (status) {
    case "invited":
      return "Инвайт-код ещё не активирован — пройдите регистрацию.";
    case "pending":
      return "Заявка ожидает одобрения администратора.";
    case "rejected":
      return "Доступ отклонён администратором.";
    case "blocked":
      return "Доступ заблокирован администратором.";
    default:
      return "";
  }
}

export const UNAUTHENTICATED = { error: "Требуется вход в студию", code: "unauthenticated" } as const;

/**
 * Проверка сессии + актуального состояния аккаунта. Возвращает либо свежую
 * строку пользователя, либо готовый ответ 401/403.
 */
export async function requireUser(
  req: NextRequest
): Promise<{ user: AccessCodeRow } | { response: NextResponse }> {
  const payload = verifyUserToken(bearerFrom(req));
  if (!payload) {
    return { response: NextResponse.json(UNAUTHENTICATED, { status: 401 }) };
  }

  const { data } = await supabaseAdmin
    .from("access_codes")
    .select(USER_COLUMNS)
    .eq("id", payload.sub)
    .maybeSingle();

  if (!data) {
    return { response: NextResponse.json(UNAUTHENTICATED, { status: 401 }) };
  }
  const user = data as unknown as AccessCodeRow;

  if (user.status !== "approved") {
    return {
      response: NextResponse.json(
        { error: statusMessage(user.status), status: user.status },
        { status: 403 }
      ),
    };
  }

  const frozenUntil = isFrozen(user.frozen_until);
  if (frozenUntil) {
    return {
      response: NextResponse.json(
        {
          error: `Аккаунт временно заморожен администратором (до ${formatFreezeUntil(frozenUntil)}).`,
          status: "frozen",
          until: frozenUntil.toISOString(),
        },
        { status: 403 }
      ),
    };
  }

  return { user };
}
