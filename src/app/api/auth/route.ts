import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getClientIp } from "@/lib/security";

const MAX_FAILED_ATTEMPTS = 10;
const BLOCK_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const windowStart = new Date(Date.now() - BLOCK_WINDOW_MS).toISOString();

    const { data: failedAttempts, error } = await supabaseAdmin
      .from("login_attempts")
      .select("id, created_at")
      .eq("ip", ip)
      .eq("success", false)
      .gte("created_at", windowStart);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const failedCount = failedAttempts?.length || 0;
    const isBlocked = failedCount >= MAX_FAILED_ATTEMPTS;
    const attemptsLeft = Math.max(0, MAX_FAILED_ATTEMPTS - failedCount);

    return NextResponse.json({
      isBlocked,
      attemptsLeft,
      maxAttempts: MAX_FAILED_ATTEMPTS,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const windowStart = new Date(Date.now() - BLOCK_WINDOW_MS).toISOString();

    // 1. Check existing failed attempts for this IP in the last 24h
    const { data: failedAttempts, error: fetchErr } = await supabaseAdmin
      .from("login_attempts")
      .select("id, created_at")
      .eq("ip", ip)
      .eq("success", false)
      .gte("created_at", windowStart)
      .order("created_at", { ascending: false });

    if (fetchErr) {
      console.error("DB check error:", fetchErr);
    }

    const failedCount = failedAttempts?.length || 0;

    if (failedCount >= MAX_FAILED_ATTEMPTS) {
      return NextResponse.json(
        {
          error: "Превышен лимит (10 неверных попыток в сутки). Доступ заблокирован на 24 часа.",
          isBlocked: true,
          attemptsLeft: 0,
        },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { password } = body;

    if (!password || typeof password !== "string") {
      return NextResponse.json({ error: "Введите пароль" }, { status: 400 });
    }

    // 2. Fetch master password from database table `system_settings`
    const { data: setting, error: settingErr } = await supabaseAdmin
      .from("system_settings")
      .select("value")
      .eq("key", "master_password")
      .single();

    const masterPassword = setting?.value || "1599";

    // 3. Verify entered password
    if (password.trim() === masterPassword) {
      // Record successful login
      await supabaseAdmin.from("login_attempts").insert({
        ip,
        success: true,
      });

      return NextResponse.json({
        success: true,
        token: "authenticated_master_session_1599",
        user: {
          id: "master-admin-user",
          userName: "Администратор",
          secretCode: "1599",
          status: "approved",
          remaining: 999,
          generationsLimit: 1000,
          generationsUsed: 1,
        },
      });
    }

    // 4. Invalid password: log failure to database
    await supabaseAdmin.from("login_attempts").insert({
      ip,
      success: false,
    });

    const newFailedCount = failedCount + 1;
    const remaining = Math.max(0, MAX_FAILED_ATTEMPTS - newFailedCount);

    if (newFailedCount >= MAX_FAILED_ATTEMPTS) {
      return NextResponse.json(
        {
          error: "10-я неверная попытка! Доступ заблокирован на 24 часа.",
          isBlocked: true,
          attemptsLeft: 0,
        },
        { status: 429 }
      );
    }

    return NextResponse.json(
      {
        error: `Неверный пароль. Осталось попыток: ${remaining} из ${MAX_FAILED_ATTEMPTS}.`,
        isBlocked: false,
        attemptsLeft: remaining,
      },
      { status: 401 }
    );
  } catch (err: any) {
    console.error("Auth Route Error:", err);
    return NextResponse.json({ error: err.message || "Ошибка сервера" }, { status: 500 });
  }
}

