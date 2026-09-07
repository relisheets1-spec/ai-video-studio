import { NextRequest, NextResponse } from "next/server";
import { MEDIA_TTL_DAYS } from "@/lib/env";
import { requireUser } from "@/lib/session";
import { getOwnedVideo, listUserVideos } from "@/lib/videos";

/** Только свои фильмы. Без сессии — 401, чужой videoId — 404. */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  const { searchParams } = new URL(req.url);
  const videoId = searchParams.get("videoId");

  // Стоимость фильма видит только администратор — пользователю поле не отдаём.
  const strip = <T extends { cost?: unknown; draft?: unknown }>(v: T) => {
    const { cost: _cost, draft: _draft, ...rest } = v;
    return rest;
  };

  if (videoId) {
    const video = getOwnedVideo(videoId, auth.user.id);
    if (!video) return NextResponse.json({ error: "Видео не найдено" }, { status: 404 });
    return NextResponse.json({ video: strip(video) });
  }

  return NextResponse.json({ videos: listUserVideos(auth.user.id).map(strip), mediaTtlDays: MEDIA_TTL_DAYS });
}
