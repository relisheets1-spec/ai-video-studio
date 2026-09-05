import fsp from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { CONTENT_TYPES, resolveMedia } from "@/lib/storage";

/**
 * Отдача файлов /media/... из каталога данных.
 *
 * В production этот путь перехватывает nginx и отдаёт файлы прямо с диска —
 * роут остаётся запасным вариантом и рабочим способом смотреть фильмы на
 * машине разработчика, где nginx нет.
 */
export async function GET(_req: NextRequest, { params }: { params: { path: string[] } }) {
  const abs = resolveMedia((params.path || []).join("/"));
  if (!abs) return new NextResponse("Not found", { status: 404 });

  try {
    const data = await fsp.readFile(abs);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": CONTENT_TYPES[path.extname(abs).toLowerCase()] || "application/octet-stream",
        "Content-Length": String(data.length),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
