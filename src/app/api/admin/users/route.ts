import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-auth";
import { clearFreeze, setFreeze } from "@/lib/freeze";
import type { AccessCode, AccessCodeRow } from "@/lib/types";

const ADMIN_COLUMNS =
  "id, user_name, secret_code, email, status, generations_limit, generations_used, " +
  "created_at, approved_at, claimed_at, frozen_until, elevenlabs_key_enc";

/** Наружу уходит только факт наличия ключа, сам ключ — никогда. */
function toAdminView(row: any): AccessCode {
  const { elevenlabs_key_enc, ...rest } = row;
  return { ...rest, has_elevenlabs_key: !!elevenlabs_key_enc };
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;

  try {
    const { data, error } = await supabaseAdmin
      .from("access_codes")
      .select(ADMIN_COLUMNS)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ users: (data || []).map(toAdminView) });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function updateUser(userId: string, patch: Record<string, unknown>) {
  const { data, error } = await supabaseAdmin
    .from("access_codes")
    .update(patch)
    .eq("id", userId)
    .select(ADMIN_COLUMNS)
    .single();
  if (error) return { error: NextResponse.json({ error: error.message }, { status: 500 }) };
  return { user: toAdminView(data) };
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;

  try {
    const { action, userId, amount, hours } = await req.json();

    if (!userId || typeof userId !== "string") {
      return NextResponse.json({ error: "userId обязателен" }, { status: 400 });
    }

    const { data: currentRow } = await supabaseAdmin
      .from("access_codes")
      .select(ADMIN_COLUMNS)
      .eq("id", userId)
      .maybeSingle();
    const current = currentRow as unknown as AccessCodeRow | null;
    if (!current) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    if (action === "set_balance") {
      // Остаток = лимит − использовано, поэтому лимит = использовано + остаток.
      const exactBalance = Math.max(0, Math.floor(Number(amount) || 0));
      const result = await updateUser(userId, {
        generations_limit: (current.generations_used || 0) + exactBalance,
      });
      if ("error" in result) return result.error;
      return NextResponse.json({ success: true, user: result.user });
    }

    if (action === "add_generations") {
      const addCount = Number(amount) || 10;
      const result = await updateUser(userId, {
        generations_limit: (current.generations_limit || 0) + addCount,
      });
      if ("error" in result) return result.error;
      return NextResponse.json({ success: true, user: result.user });
    }

    if (action === "approve") {
      if (current.status === "invited" || !current.email) {
        return NextResponse.json(
          { error: "Код ещё никем не занят — одобрять нечего" },
          { status: 409 }
        );
      }
      const result = await updateUser(userId, {
        status: "approved",
        approved_at: new Date().toISOString(),
      });
      if ("error" in result) return result.error;
      return NextResponse.json({ success: true, user: result.user });
    }

    if (action === "reject") {
      const result = await updateUser(userId, { status: "rejected" });
      if ("error" in result) return result.error;
      return NextResponse.json({ success: true, user: result.user });
    }

    if (action === "reset_invite") {
      // Освобождает код: почта, ключ и заявка стираются, код можно выдать заново.
      const result = await updateUser(userId, {
        status: "invited",
        email: null,
        elevenlabs_key_enc: null,
        claimed_at: null,
        approved_at: null,
        frozen_until: null,
      });
      if ("error" in result) return result.error;
      return NextResponse.json({ success: true, user: result.user });
    }

    if (action === "freeze") {
      const span = hours === "forever" ? "forever" : Math.max(1, Number(hours) || 24);
      await setFreeze(userId, span as number | "forever");
      return NextResponse.json({ success: true, frozen: true });
    }

    if (action === "unfreeze") {
      await clearFreeze(userId);
      return NextResponse.json({ success: true, frozen: false });
    }

    if (action === "delete") {
      const { error } = await supabaseAdmin.from("access_codes").delete().eq("id", userId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
