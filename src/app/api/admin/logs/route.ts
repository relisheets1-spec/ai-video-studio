import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken, UNAUTHORIZED } from "@/lib/admin-auth";
import { parseStage } from "@/lib/pipeline-log";

/**
 * Лог отказов генерации по этапам.
 *
 * Источник — сами записи video_generations: status="failed" плюс
 * error_message с префиксом этапа. Отдельной таблицы pipeline_errors пока нет
 * (SQL готов в supabase/migrations/0001, но DDL к базе из репозитория
 * недоступен), поэтому фильтруем по префиксу.
 *
 * Заодно отдаём «зависшие» записи: генерации, которые остались в промежуточном
 * статусе дольше двух часов, — их до этой правки было не отличить от идущих
 * прямо сейчас.
 */
export async function GET(req: NextRequest) {
  if (!verifyAdminToken(req)) {
    return NextResponse.json(UNAUTHORIZED, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const stageFilter = searchParams.get("stage");
    const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit")) || 100));

    const { data, error } = await supabaseAdmin
      .from("video_generations")
      .select("id, user_id, topic, status, error_message, created_at, updated_at")
      .in("status", ["failed", "generating_script", "generating_audio", "generating_images"])
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const staleCutoff = Date.now() - 2 * 60 * 60 * 1000;

    const logs = (data || [])
      .map((row) => {
        const isStale =
          row.status !== "failed" && new Date(row.created_at).getTime() < staleCutoff;
        return {
          id: row.id,
          userId: row.user_id,
          topic: row.topic,
          status: row.status,
          stale: isStale,
          stage: parseStage(row.error_message),
          message: row.error_message || (isStale ? "Генерация прервана и не завершилась" : null),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      })
      // Идущие прямо сейчас генерации в лог не показываем — только упавшие и зависшие.
      .filter((row) => row.status === "failed" || row.stale)
      .filter((row) => !stageFilter || stageFilter === "all" || row.stage === stageFilter);

    return NextResponse.json({ logs });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
