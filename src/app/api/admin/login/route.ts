import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

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

    // Generate separate admin session token
    const adminToken = `ai_video_admin_session_${Date.now()}_${Math.random().toString(36).substring(2, 12)}`;

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
