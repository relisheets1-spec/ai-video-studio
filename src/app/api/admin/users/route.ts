import { NextRequest, NextResponse } from "next/server";
import { rotateCodeFor } from "@/lib/access";
import { requireAdmin } from "@/lib/admin-auth";
import { deleteFilmMedia } from "@/lib/storage";
import {
  blockUser,
  deleteUser,
  findUserById,
  listUsers,
  setElevenLabsKey,
  setOpenAiKey,
  unblockUser,
} from "@/lib/users";
import { studioStats, userVideoIds } from "@/lib/videos";

/** Таблица пользователей. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  return NextResponse.json({ users: listUsers(), stats: studioStats() });
}

/**
 * Действия над пользователем: block / unblock / reset_keys / rotate_code / delete.
 * Лимитов генераций нет — каждый платит со своих ключей.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "");
  const userId = typeof body?.userId === "string" ? body.userId : "";
  const user = userId ? findUserById(userId) : null;
  if (!user) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });

  const done = (extra: Record<string, unknown> = {}) =>
    NextResponse.json({ success: true, users: listUsers(), stats: studioStats(), ...extra });

  switch (action) {
    case "block":
      blockUser(user.id);
      return done();
    case "unblock":
      unblockUser(user.id);
      return done();
    case "reset_keys":
      setElevenLabsKey(user.id, null);
      setOpenAiKey(user.id, null);
      return done();
    case "rotate_code": {
      // Новый код сразу привязан к почте; старая пара «почта + код» больше не входит.
      const row = rotateCodeFor(user.email);
      return done({ code: row.code });
    }
    case "delete": {
      // Сначала файлы на диске, потом строки: иначе фильмы осиротеют.
      for (const id of userVideoIds(user.id)) await deleteFilmMedia(id);
      deleteUser(user.id);
      return done();
    }
    default:
      return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
  }
}
