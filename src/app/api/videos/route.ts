import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { getOwnedVideo, listUserVideos } from "@/lib/videos";

/** Только свои фильмы. Без сессии — 401, чужой videoId — 404. */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  const { searchParams } = new URL(req.url);
  const videoId = searchParams.get("videoId");

  if (videoId) {
    const video = getOwnedVideo(videoId, auth.user.id);
    if (!video) return NextResponse.json({ error: "Видео не найдено" }, { status: 404 });
    return NextResponse.json({ video });
  }

  return NextResponse.json({ videos: listUserVideos(auth.user.id) });
}
