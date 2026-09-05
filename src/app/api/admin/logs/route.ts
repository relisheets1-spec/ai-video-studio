import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { parseStage } from "@/lib/pipeline-log";
import { listProblemVideos } from "@/lib/videos";

/**
 * Журнал отказов: упавшие генерации (status = failed с префиксом этапа в
 * error_message) и зависшие — те, что больше двух часов сидят в промежуточном
 * статусе. Идущие прямо сейчас в журнал не попадают.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;

  const { searchParams } = new URL(req.url);
  const stageFilter = searchParams.get("stage");
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit")) || 100));

  const logs = listProblemVideos(limit)
    .map((row) => ({ ...row, stage: parseStage(row.message) }))
    .filter((row) => !stageFilter || stageFilter === "all" || row.stage === stageFilter);

  return NextResponse.json({ logs });
}
