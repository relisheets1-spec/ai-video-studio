import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { checkAttempts, getClientIp, recordAttempt, type AttemptKind } from "@/lib/security";
import { normalizeEmail } from "@/lib/admins";
import { safeEqualString } from "@/lib/crypto";
import { formatFreezeUntil, isFrozen } from "@/lib/freeze";
import { signUserToken, statusMessage, toPublicUser, USER_COLUMNS } from "@/lib/session";
import type { AccessCodeRow } from "@/lib/types";

/** Статус IP-лимита для формы: сколько попыток осталось. */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const kind: AttemptKind = searchParams.get("kind") === "register" ? "register" : "login";
    const attempts = await checkAttempts(getClientIp(req), kind);
    return NextResponse.json({
      isBlocked: attempts.blocked,
      attemptsLeft: attempts.attemptsLeft,
      maxAttempts: attempts.max,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** Вход: почта + инвайт-код. Доступ только со статусом approved и без заморозки. */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const attempts = await checkAttempts(ip, "login");
    if (attempts.blocked) {
      return NextResponse.json(
        {
          error: `Превышен лимит (${attempts.label}). Доступ с этого IP временно закрыт.`,
          isBlocked: true,
          attemptsLeft: 0,
        },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(body?.email);
    const code = typeof body?.code === "string" ? body.code.trim() : "";

    if (!email || !code) {
      return NextResponse.json({ error: "Введите почту и инвайт-код" }, { status: 400 });
    }

    const { data } = await supabaseAdmin
      .from("access_codes")
      .select(USER_COLUMNS)
      .eq("email", email)
      .maybeSingle();
    const user = (data as unknown as AccessCodeRow | null) ?? null;

    if (!user || !safeEqualString(user.secret_code, code)) {
      await recordAttempt(ip, "login", false, email);
      const left = Math.max(0, attempts.attemptsLeft - 1);
      if (left === 0) {
        return NextResponse.json(
          { error: "Слишком много неверных попыток. Доступ с этого IP временно закрыт.", isBlocked: true, attemptsLeft: 0 },
          { status: 429 }
        );
      }
      return NextResponse.json(
        {
          error: `Неверная почта или инвайт-код. Осталось попыток: ${left} из ${attempts.max}.`,
          isBlocked: false,
          attemptsLeft: left,
        },
        { status: 401 }
      );
    }

    if (user.status !== "approved") {
      return NextResponse.json(
        { error: statusMessage(user.status), status: user.status },
        { status: 403 }
      );
    }

    const frozenUntil = isFrozen(user.frozen_until);
    if (frozenUntil) {
      return NextResponse.json(
        {
          error: `Аккаунт временно заморожен администратором (до ${formatFreezeUntil(frozenUntil)}).`,
          status: "frozen",
          until: frozenUntil.toISOString(),
        },
        { status: 403 }
      );
    }

    await recordAttempt(ip, "login", true, email);

    return NextResponse.json({
      success: true,
      token: signUserToken(user.id),
      user: toPublicUser(user),
    });
  } catch (err: any) {
    console.error("Auth Route Error:", err);
    return NextResponse.json({ error: err.message || "Ошибка сервера" }, { status: 500 });
  }
}
