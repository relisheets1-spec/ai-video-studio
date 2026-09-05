import { NextRequest, NextResponse } from "next/server";
import { checkAttempts, getClientIp, recordAttempt } from "@/lib/security";
import { checkSitePassword, setSiteCookie, siteLockEnabled, siteUnlocked } from "@/lib/site-gate";

/** Состояние заглушки сайта: нужна ли она и снята ли уже. */
export async function GET(req: NextRequest) {
  return NextResponse.json({ enabled: siteLockEnabled(), unlocked: siteUnlocked(req) });
}

/** Снять заглушку общим паролем сайта. */
export async function POST(req: NextRequest) {
  if (!siteLockEnabled()) return NextResponse.json({ success: true });

  const ip = getClientIp(req);
  const attempts = checkAttempts(ip, "login");
  if (attempts.blocked) {
    return NextResponse.json({ error: `Превышен лимит (${attempts.label}). Попробуйте позже.` }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  if (!checkSitePassword(body?.password)) {
    recordAttempt(ip, "login", false, null);
    return NextResponse.json({ error: "Неверный пароль" }, { status: 401 });
  }

  return setSiteCookie(NextResponse.json({ success: true }));
}
