import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { normalizeCost } from "@/lib/pricing";
import { getVideo, listAllVideos } from "@/lib/videos";

/**
 * Фильмы всех пользователей — со стоимостью. Без videoId — список для
 * таблицы, с videoId — полная запись со сценами для плеера.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;

  const videoId = new URL(req.url).searchParams.get("videoId");
  if (videoId) {
    const video = getVideo(videoId);
    if (!video) return NextResponse.json({ error: "Фильм не найден" }, { status: 404 });
    return NextResponse.json({ video: { ...video, cost: normalizeCost(video.cost) } });
  }

  const videos = listAllVideos(300).map((v) => ({
    id: v.id,
    email: v.email,
    topic: v.topic,
    status: v.status,
    scenes: v.scenes.length,
    durationSeconds: v.actual_duration_seconds,
    orientation: v.scenes[0]?.orientation || "landscape",
    mediaPurgedAt: v.media_purged_at,
    createdAt: v.created_at,
    cost: normalizeCost(v.cost),
  }));
  return NextResponse.json({ videos });
}
