import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Проверка «жив ли сервер» для release.sh и nginx. Базу не трогает. */
export function GET() {
  return NextResponse.json({ ok: true });
}
