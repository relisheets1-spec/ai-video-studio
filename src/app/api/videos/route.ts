import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireUser } from "@/lib/session";

/** Только свои видео. Без сессии — 401, чужой videoId — 404. */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  try {
    const { searchParams } = new URL(req.url);
    const videoId = searchParams.get("videoId");

    if (videoId) {
      const { data: video, error } = await supabaseAdmin
        .from("video_generations")
        .select("*")
        .eq("id", videoId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (!video) return NextResponse.json({ error: "Видео не найдено" }, { status: 404 });
      return NextResponse.json({ video });
    }

    const { data: videos, error: videosError } = await supabaseAdmin
      .from("video_generations")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(50);

    if (videosError) {
      return NextResponse.json({ error: videosError.message }, { status: 500 });
    }

    return NextResponse.json({ videos });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
