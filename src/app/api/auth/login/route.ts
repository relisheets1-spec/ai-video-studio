import { NextRequest, NextResponse } from "next/server";
import { checkAccess } from "@/lib/access";
import { checkAdminCode, isAdminEmail, setAdminCookie, signAdminToken } from "@/lib/admin-auth";
import { normalizeEmail } from "@/lib/env";
import { checkAttempts, failureDelay, getClientIp, recordAttempt } from "@/lib/security";
import { setSessionCookie, signUserToken } from "@/lib/session";
import { siteLockedResponse, siteUnlocked } from "@/lib/site-gate";
import { ensureUser, statusMessage, toPublicUser, touchLogin } from "@/lib/users";

/**
 * Единственная форма входа: почта + код.
 *
 * Почта администратора + его код → cookie администратора, клиент уходит в
 * /admin. Почта + код доступа, выданный в панели → аккаунт (заводится при
 * первом входе) и сессия студии на 30 дней. Администратор может быть и
 * пользователем: его почта с кодом доступа открывает обычную студию. Писем нет.
 */
export async function POST(req: NextRequest) {
  if (!siteUnlocked(req)) return siteLockedResponse();

  const ip = getClientIp(req);
  const body = await req.json().catch(() => ({}));
  const email = normalizeEmail(body?.email);
  const code = typeof body?.code === "string" ? body.code : "";
  if (!email || !code.trim()) return NextResponse.json({ error: "Введите почту и код" }, { status: 400 });

  // --- Администратор ---
  // Сработавший лимит админа закрывает только проверку админского кода:
  // студия по коду доступа для той же почты продолжает работать.
  const adminChecked = isAdminEmail(email) && !checkAttempts(ip, "admin").blocked;
  if (adminChecked) {
    if (checkAdminCode(code)) {
      recordAttempt(ip, "admin", true, email);
      return setAdminCookie(NextResponse.json({ role: "admin" }), signAdminToken(email));
    }
    // Не код администратора — возможно, это код доступа в студию для той же
    // почты. Проверяем ниже; если и он не подошёл, попытка засчитывается в
    // оба лимита.
  }

  // --- Пользователь ---
  const attempts = checkAttempts(ip, "login");
  if (attempts.blocked) {
    return NextResponse.json({ error: `Превышен лимит (${attempts.label}). Попробуйте позже.` }, { status: 429 });
  }
  const check = checkAccess(email, code);
  if (!check.ok) {
    recordAttempt(ip, "login", false, email);
    if (adminChecked) {
      recordAttempt(ip, "admin", false, email);
      console.warn(`[admin] неверный код с ${ip}`);
    }
    await failureDelay();
    return NextResponse.json({ error: check.error }, { status: 401 });
  }

  const user = ensureUser(email);
  if (user.status !== "active") {
    recordAttempt(ip, "login", false, email);
    return NextResponse.json({ error: statusMessage(user.status), status: user.status }, { status: 403 });
  }
  recordAttempt(ip, "login", true, email);
  touchLogin(user.id);

  const res = NextResponse.json({ role: "user", user: toPublicUser(user), firstUse: check.firstUse });
  return setSessionCookie(res, signUserToken(user.id, user.session_epoch));
}
