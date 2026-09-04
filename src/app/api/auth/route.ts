import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, userName, secretCode } = body;

    if (!secretCode || typeof secretCode !== "string") {
      return NextResponse.json({ error: "Секретный код обязателен" }, { status: 400 });
    }

    const cleanCode = secretCode.trim();

    if (action === "check") {
      const { data: user, error } = await supabaseAdmin
        .from("access_codes")
        .select("*")
        .eq("secret_code", cleanCode)
        .single();

      if (error || !user) {
        return NextResponse.json({ error: "Код не найден" }, { status: 404 });
      }

      return NextResponse.json({
        user: {
          id: user.id,
          userName: user.user_name,
          secretCode: user.secret_code,
          status: user.status,
          generationsLimit: user.generations_limit,
          generationsUsed: user.generations_used,
          remaining: Math.max(0, user.generations_limit - user.generations_used),
        },
      });
    }

    if (action === "login") {
      if (!userName || typeof userName !== "string") {
        return NextResponse.json({ error: "Имя пользователя обязательно" }, { status: 400 });
      }
      const cleanName = userName.trim();

      // Check if user already exists with this code
      const { data: existingUser } = await supabaseAdmin
        .from("access_codes")
        .select("*")
        .eq("secret_code", cleanCode)
        .single();

      if (existingUser) {
        // If user already approved or pending
        return NextResponse.json({
          user: {
            id: existingUser.id,
            userName: existingUser.user_name,
            secretCode: existingUser.secret_code,
            status: existingUser.status,
            generationsLimit: existingUser.generations_limit,
            generationsUsed: existingUser.generations_used,
            remaining: Math.max(0, existingUser.generations_limit - existingUser.generations_used),
          },
        });
      }

      // New request: create pending record
      const { data: newUser, error: insertError } = await supabaseAdmin
        .from("access_codes")
        .insert({
          user_name: cleanName,
          secret_code: cleanCode,
          status: "pending",
          generations_limit: 10,
          generations_used: 0,
        })
        .select()
        .single();

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }

      return NextResponse.json({
        user: {
          id: newUser.id,
          userName: newUser.user_name,
          secretCode: newUser.secret_code,
          status: newUser.status,
          generationsLimit: newUser.generations_limit,
          generationsUsed: newUser.generations_used,
          remaining: 10,
        },
      });
    }

    return NextResponse.json({ error: "Неверное действие" }, { status: 400 });
  } catch (err: any) {
    console.error("Auth API Error:", err);
    return NextResponse.json({ error: err.message || "Ошибка сервера" }, { status: 500 });
  }
}
