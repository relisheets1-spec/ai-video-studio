import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { addAdmin, listAdmins, normalizeEmail, primaryAdminEmail, removeAdmin } from "@/lib/admins";

/** Список администраторов — видят все админы. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  return NextResponse.json({ admins: await listAdmins(), primaryEmail: primaryAdminEmail() });
}

/** Назначить администратора по почте — только основной. */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, { primaryOnly: true });
  if ("response" in auth) return auth.response;

  const body = await req.json().catch(() => ({}));
  const email = normalizeEmail(body?.email);
  if (!email) return NextResponse.json({ error: "Укажите корректную почту" }, { status: 400 });

  const result = await addAdmin(email, auth.admin.email);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ success: true, admins: await listAdmins() });
}

/** Снять администратора — только основной; основного снять нельзя. */
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req, { primaryOnly: true });
  if ("response" in auth) return auth.response;

  const { searchParams } = new URL(req.url);
  const email = normalizeEmail(searchParams.get("email"));
  if (!email) return NextResponse.json({ error: "Укажите почту" }, { status: 400 });

  const result = await removeAdmin(email);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ success: true, admins: await listAdmins() });
}
