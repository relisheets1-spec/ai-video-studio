import { NextRequest, NextResponse } from "next/server";
import { signToken, verifyToken } from "./crypto";
import { getAdmin, getAdminEpoch } from "./admins";
import type { AdminInfo } from "./types";

/**
 * Сессия администратора: подписанный токен с почтой, сроком и эпохой.
 * На каждом запросе почта сверяется со списком админов (удалённый админ
 * отваливается сразу), а эпоха — с текущей (смена пароля гасит все сессии).
 */

const PREFIX = "av2.";
const TTL_MS = 12 * 60 * 60 * 1000;

export interface AdminSessionPayload {
  email: string;
  iat: number;
  exp: number;
  epoch: number;
}

export function signAdminToken(email: string, epoch: number): string {
  const now = Date.now();
  return signToken(PREFIX, "admin-session", { email, iat: now, exp: now + TTL_MS, epoch });
}

export function verifyAdminToken(token: string | null | undefined): AdminSessionPayload | null {
  const payload = verifyToken<AdminSessionPayload>(token, PREFIX, "admin-session");
  return payload && typeof payload.email === "string" && payload.email ? payload : null;
}

export function adminTokenFrom(req: NextRequest): string | null {
  const direct = req.headers.get("x-admin-token");
  if (direct) return direct.trim() || null;
  const header = req.headers.get("authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() || null : null;
}

/** Единый ответ на неавторизованный запрос. */
export const UNAUTHORIZED = {
  error: "Доступ запрещен: требуется авторизация администратора",
} as const;

export async function requireAdmin(
  req: NextRequest,
  opts?: { primaryOnly?: boolean }
): Promise<{ admin: AdminInfo; payload: AdminSessionPayload } | { response: NextResponse }> {
  const payload = verifyAdminToken(adminTokenFrom(req));
  if (!payload) return { response: NextResponse.json(UNAUTHORIZED, { status: 401 }) };

  const admin = await getAdmin(payload.email);
  if (!admin) return { response: NextResponse.json(UNAUTHORIZED, { status: 401 }) };

  const epoch = await getAdminEpoch();
  if (payload.epoch !== epoch) {
    return {
      response: NextResponse.json(
        { error: "Сессия администратора устарела, войдите заново" },
        { status: 401 }
      ),
    };
  }

  if (opts?.primaryOnly && !admin.isPrimary) {
    return {
      response: NextResponse.json(
        { error: "Это действие доступно только основному администратору" },
        { status: 403 }
      ),
    };
  }

  return { admin, payload };
}
