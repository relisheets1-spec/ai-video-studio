import { NextRequest, NextResponse } from "next/server";
import { INVITE_TTL_DAYS, issueInvite } from "@/lib/access";
import { requireAdmin } from "@/lib/admin-auth";
import { DEFAULT_GENERATION_LIMIT } from "@/lib/env";
import { inviteMail, rejectedMail, sendMail } from "@/lib/mail";
import { deleteFilmMedia } from "@/lib/storage";
import {
  addGenerations,
  blockUser,
  deleteUser,
  findUserById,
  listUsers,
  markInvited,
  setBalance,
  setElevenLabsKey,
  setStatus,
  unblockUser,
} from "@/lib/users";
import { studioStats, userVideoIds } from "@/lib/videos";

/** Таблица пользователей и заявок. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  return NextResponse.json({ users: listUsers(), stats: studioStats() });
}

/**
 * Действия админа над пользователем.
 *
 * approve — одобрить заявку: статус invited, стартовый лимит и одноразовый
 * код приглашения на 7 дней. Код возвращается в ответе, чтобы админ мог
 * передать его лично; с флагом notify он ещё и уходит письмом.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "");
  const userId = typeof body?.userId === "string" ? body.userId : "";
  const notify = body?.notify !== false;

  const user = userId ? findUserById(userId) : null;
  if (!user) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });

  const done = (extra: Record<string, unknown> = {}) =>
    NextResponse.json({ success: true, users: listUsers(), stats: studioStats(), ...extra });

  switch (action) {
    case "approve":
    case "resend_invite": {
      if (user.status === "blocked" || user.status === "rejected") setStatus(user.id, "pending");
      const limit = Math.max(1, Math.floor(Number(body?.limit) || DEFAULT_GENERATION_LIMIT));
      if (user.status !== "approved") markInvited(user.id, limit);

      const invite = issueInvite(user.email, auth.admin.email);
      let mailSent = false;
      if (notify) {
        const res = await sendMail(inviteMail(user.email, invite.code, INVITE_TTL_DAYS));
        mailSent = res.ok;
      }
      return done({ invite: { code: invite.code, expiresAt: invite.expires_at }, mailSent });
    }

    case "reject": {
      setStatus(user.id, "rejected");
      if (notify) await sendMail(rejectedMail(user.email));
      return done();
    }

    case "block":
      blockUser(user.id);
      return done();

    case "unblock":
      unblockUser(user.id);
      return done();

    case "add_generations":
      addGenerations(user.id, Number(body?.amount) || 5);
      return done();

    case "set_balance":
      setBalance(user.id, Number(body?.amount) || 0);
      return done();

    case "reset_key":
      setElevenLabsKey(user.id, null);
      return done();

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
