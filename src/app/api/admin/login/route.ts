import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { signAdminToken } from "@/lib/admin-auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { password } = body;

    if (!password || typeof password !== "string") {
      return NextResponse.json({ error: "Введите пароль администратора" }, { status: 400 });
    }

    // Fetch master password from database table `system_settings`
    const { data: setting } = await supabaseAdmin
      .from("system_settings")
      .select("value")
      .eq("key", "master_password")
      .single();

    const masterPassword = setting?.value || "1599";

    if (password.trim() !== masterPassword) {
      return NextResponse.json({ error: "Неверный пароль администратора" }, { status: 401 });
    }

    // Подписанный токен со сроком жизни. Прежний вариант был просто строкой
    // с Date.now() и случайным хвостом — сервер его никак не сверял.
    const adminToken = signAdminToken();

    return NextResponse.json({
      success: true,
      adminToken,
      message: "Успешная авторизация администратора",
    });
  } catch (err: any) {
    console.error("Admin Login Error:", err);
    return NextResponse.json({ error: err.message || "Ошибка сервера" }, { status: 500 });
  }
}
