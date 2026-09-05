import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { checkAttempts, getClientIp, recordAttempt } from "@/lib/security";
import { normalizeEmail } from "@/lib/admins";
import { encryptSecret } from "@/lib/crypto";
import { statusMessage, USER_COLUMNS } from "@/lib/session";
import type { AccessCodeRow } from "@/lib/types";
import { validateElevenLabsKey } from "@/lib/elevenlabs-key";

/**
 * Регистрация: почта + инвайт-код + ключ ElevenLabs.
 * Код должен быть создан админом и ещё никем не занят (status = invited).
 * После регистрации аккаунт ждёт одобрения; входа до одобрения нет.
 */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const attempts = await checkAttempts(ip, "register");
    if (attempts.blocked) {
      return NextResponse.json(
        { error: `Превышен лимит (${attempts.label}). Попробуйте позже.`, isBlocked: true, attemptsLeft: 0 },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(body?.email);
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    const key = validateElevenLabsKey(body?.elevenLabsKey);

    if (!email) return NextResponse.json({ error: "Укажите корректную почту" }, { status: 400 });
    if (!code) return NextResponse.json({ error: "Введите инвайт-код" }, { status: 400 });
    if (!key) {
      return NextResponse.json(
        { error: "Введите ключ ElevenLabs (латиница и цифры, обычно начинается с sk_)" },
        { status: 400 }
      );
    }

    const { data } = await supabaseAdmin
      .from("access_codes")
      .select(USER_COLUMNS)
      .eq("secret_code", code)
      .maybeSingle();
    const row = (data as unknown as AccessCodeRow | null) ?? null;

    if (!row) {
      await recordAttempt(ip, "register", false, email);
      return NextResponse.json(
        { error: "Неверный инвайт-код", attemptsLeft: Math.max(0, attempts.attemptsLeft - 1) },
        { status: 404 }
      );
    }

    // Код свободен — занимаем его.
    if (row.status === "invited" && !row.email) {
      const { data: taken } = await supabaseAdmin
        .from("access_codes")
        .select("id")
        .eq("email", email)
        .maybeSingle();
      if (taken) {
        return NextResponse.json(
          { error: "Эта почта уже зарегистрирована — используйте вход" },
          { status: 409 }
        );
      }

      const { data: updated, error } = await supabaseAdmin
        .from("access_codes")
        .update({
          email,
          elevenlabs_key_enc: encryptSecret(key),
          status: "pending",
          claimed_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .eq("status", "invited")
        .select("id")
        .maybeSingle();

      if (error) {
        if (error.code === "23505") {
          return NextResponse.json({ error: "Эта почта уже зарегистрирована" }, { status: 409 });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      if (!updated) {
        return NextResponse.json({ error: "Этот инвайт-код уже использован" }, { status: 409 });
      }

      await recordAttempt(ip, "register", true, email);
      return NextResponse.json({ success: true, status: "pending" });
    }

    // Код уже занят этой же почтой — повторная отправка.
    if (row.email === email) {
      if (row.status === "pending") {
        await supabaseAdmin
          .from("access_codes")
          .update({ elevenlabs_key_enc: encryptSecret(key) })
          .eq("id", row.id);
        return NextResponse.json({
          success: true,
          status: "pending",
          message: "Заявка уже отправлена, ключ обновлён. Ожидайте одобрения.",
        });
      }
      if (row.status === "approved") {
        return NextResponse.json(
          { error: "Вы уже зарегистрированы и одобрены — используйте вход", status: "approved" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: statusMessage(row.status), status: row.status }, { status: 403 });
    }

    await recordAttempt(ip, "register", false, email);
    return NextResponse.json({ error: "Этот инвайт-код уже использован другим пользователем" }, { status: 409 });
  } catch (err: any) {
    console.error("Register Route Error:", err);
    return NextResponse.json({ error: err.message || "Ошибка сервера" }, { status: 500 });
  }
}
