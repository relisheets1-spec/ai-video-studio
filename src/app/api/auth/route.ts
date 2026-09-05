import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getClientIp } from "@/lib/security";
import { getFreezeUntil, formatFreezeUntil } from "@/lib/freeze";

const MAX_FAILED_ATTEMPTS = 10;
const BLOCK_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const secretCode = searchParams.get("secretCode");
    const userId = searchParams.get("userId");

    // 1. If secretCode or userId is provided, return fresh user balance from DB
    if (userId || secretCode) {
      let user: any = null;

      if (userId && typeof userId === "string" && userId.trim()) {
        const { data: userById } = await supabaseAdmin
          .from("access_codes")
          .select("*")
          .eq("id", userId.trim())
          .maybeSingle();
        if (userById) user = userById;
      }

      if (!user && secretCode && typeof secretCode === "string") {
        const cleanCode = secretCode.trim();

        // Look up user by secret_code
        let { data: userByCode } = await supabaseAdmin
          .from("access_codes")
          .select("*")
          .eq("secret_code", cleanCode)
          .maybeSingle();

        if (userByCode) user = userByCode;

        // If not found and code is 1599, also check for Administrator account
        if (!user && cleanCode === "1599") {
          const { data: adminUser } = await supabaseAdmin
            .from("access_codes")
            .select("*")
            .ilike("user_name", "%Администратор%")
            .maybeSingle();
          if (adminUser) user = adminUser;
        }
      }

      if (user) {
        return NextResponse.json({
          success: true,
          user: {
            id: user.id,
            userName: user.user_name,
            secretCode: user.secret_code,
            status: user.status,
            remaining: Math.max(0, user.generations_limit - user.generations_used),
            generationsLimit: user.generations_limit,
            generationsUsed: user.generations_used,
          },
        });
      }
    }

    // 2. Default: return IP rate limiting status
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
      return NextResponse.json({ error: "Введите пароль или код доступа" }, { status: 400 });
    }

    const cleanInput = password.trim();

    // 2. Fetch master password from database table `system_settings`
    const { data: setting } = await supabaseAdmin
      .from("system_settings")
      .select("value")
      .eq("key", "master_password")
      .single();

    const masterPassword = setting?.value || "1599";

    // 3. Check if input matches master password (1599)
    if (cleanInput === masterPassword) {
      await supabaseAdmin.from("login_attempts").insert({
        ip,
        success: true,
      });

      // Synchronize with real account in access_codes
      let { data: adminRecord } = await supabaseAdmin
        .from("access_codes")
        .select("*")
        .eq("secret_code", "1599")
        .maybeSingle();

      if (!adminRecord) {
        // Check if there is an existing admin record by name
        const { data: existingAdmin } = await supabaseAdmin
          .from("access_codes")
          .select("*")
          .ilike("user_name", "%Администратор%")
          .maybeSingle();

        if (existingAdmin) {
          adminRecord = existingAdmin;
        } else {
          // Create admin record in access_codes
          const { data: createdAdmin } = await supabaseAdmin
            .from("access_codes")
            .insert({
              user_name: "Администратор",
              secret_code: "1599",
              status: "approved",
              generations_limit: 20,
              generations_used: 2,
              approved_at: new Date().toISOString(),
            })
            .select()
            .single();
          adminRecord = createdAdmin;
        }
      }

      const remaining = adminRecord
        ? Math.max(0, adminRecord.generations_limit - adminRecord.generations_used)
        : 18;

      return NextResponse.json({
        success: true,
        token: `user_auth_${adminRecord?.id || "admin"}_${Date.now()}`,
        user: {
          id: adminRecord?.id || "admin",
          userName: adminRecord?.user_name || "Администратор",
          secretCode: adminRecord?.secret_code || "1599",
          status: "approved",
          remaining,
          generationsLimit: adminRecord?.generations_limit || 20,
          generationsUsed: adminRecord?.generations_used || 2,
        },
      });
    }

    // 4. Check if input matches an access code from access_codes table
    const { data: userCode, error: codeErr } = await supabaseAdmin
      .from("access_codes")
      .select("*")
      .eq("secret_code", cleanInput)
      .maybeSingle();

    if (userCode) {
      if (userCode.status === "pending") {
        return NextResponse.json(
          {
            error: "Ваш инвайт-код ожидает одобрения администратора.",
            status: "pending",
          },
          { status: 403 }
        );
      }

      if (userCode.status === "rejected" || userCode.status === "blocked") {
        return NextResponse.json(
          {
            error: "Доступ по данному коду заблокирован или отклонен администратором.",
            status: userCode.status,
          },
          { status: 403 }
        );
      }

      // Временная заморозка: отдельно от постоянной блокировки статусом.
      const frozenUntil = await getFreezeUntil(userCode.id);
      if (frozenUntil) {
        return NextResponse.json(
          {
            error: `Аккаунт временно заморожен администратором (до ${formatFreezeUntil(frozenUntil.toISOString())}).`,
            status: "frozen",
          },
          { status: 403 }
        );
      }

      // Approved user code
      await supabaseAdmin.from("login_attempts").insert({
        ip,
        success: true,
      });

      const remaining = Math.max(0, userCode.generations_limit - userCode.generations_used);

      return NextResponse.json({
        success: true,
        token: `user_auth_${userCode.id}_${Date.now()}`,
        user: {
          id: userCode.id,
          userName: userCode.user_name,
          secretCode: userCode.secret_code,
          status: userCode.status,
          remaining,
          generationsLimit: userCode.generations_limit,
          generationsUsed: userCode.generations_used,
        },
      });
    }

    // 5. Invalid password/code: log failure to database
    await supabaseAdmin.from("login_attempts").insert({
      ip,
      success: false,
    });

    const newFailedCount = failedCount + 1;
    const remainingAttempts = Math.max(0, MAX_FAILED_ATTEMPTS - newFailedCount);

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
        error: `Неверный пароль или код доступа. Осталось попыток: ${remainingAttempts} из ${MAX_FAILED_ATTEMPTS}.`,
        isBlocked: false,
        attemptsLeft: remainingAttempts,
      },
      { status: 401 }
    );
  } catch (err: any) {
    console.error("Auth Route Error:", err);
    return NextResponse.json({ error: err.message || "Ошибка сервера" }, { status: 500 });
  }
}
