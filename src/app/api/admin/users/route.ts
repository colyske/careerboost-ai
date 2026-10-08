import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasValidOrigin } from "@/lib/request-security";

export const dynamic = "force-dynamic";

async function getAdmin() {
  const supabase = await createSupabaseServerClient();
  const { data: auth, error } = await supabase.auth.getUser();
  if (error || !auth.user) return { user: null, role: null };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", auth.user.id).single();
  const role = profile?.role as string | undefined;
  const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return { user: auth.user, role, aal2: role !== "admin" && role !== "owner" || assurance?.currentLevel === "aal2" };
}

export async function GET(request: Request) {
  const { user, role, aal2 } = await getAdmin();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (role !== "admin" && role !== "owner") return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  if (!aal2) return NextResponse.json({ error: "Administrator accounts must enable authenticator MFA before using staff tools." }, { status: 403 });
  const offset = Math.max(0, Number(new URL(request.url).searchParams.get("offset")) || 0);
  const { data, error } = await createSupabaseAdminClient().rpc("admin_list_users", { p_actor_id: user.id, p_limit: 100, p_offset: offset });
  if (error) return NextResponse.json({ error: "User directory is not available." }, { status: 503 });
  return NextResponse.json({ users: data }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  const { user, role, aal2 } = await getAdmin();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (role !== "admin" && role !== "owner") return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  if (!aal2) return NextResponse.json({ error: "Administrator accounts must enable authenticator MFA before using staff tools." }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const value = body as { targetUserId?: unknown; amount?: unknown; role?: unknown; idempotencyKey?: unknown } | null;
  if (typeof value?.targetUserId !== "string" || !/^[\da-f-]{36}$/i.test(value.targetUserId)) return NextResponse.json({ error: "Invalid account." }, { status: 400 });
  const admin = createSupabaseAdminClient();
  if (value.role !== undefined) {
    if (role !== "owner") return NextResponse.json({ error: "SuperAdmin access required to change roles." }, { status: 403 });
    if (value.role !== "candidate" && value.role !== "admin" && value.role !== "owner") return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    const { error } = await admin.rpc("admin_set_user_role", { p_actor_id: user.id, p_target_user_id: value.targetUserId, p_new_role: value.role });
    if (error) return NextResponse.json({ error: "Role change was not applied." }, { status: 409 });
    return NextResponse.json({ updated: true });
  }
  if (!Number.isInteger(value.amount) || Number(value.amount) < 1 || Number(value.amount) > 1000) return NextResponse.json({ error: "Enter a credit adjustment from 1 to 1,000." }, { status: 400 });
  const idempotencyKey = typeof value.idempotencyKey === "string" && /^[\da-f-]{36}$/i.test(value.idempotencyKey) ? value.idempotencyKey : null;
  if (!idempotencyKey) return NextResponse.json({ error: "Invalid adjustment reference." }, { status: 400 });
  const { data: balance, error } = await admin.rpc("admin_adjust_credits", {
    p_actor_id: user.id, p_target_user_id: value.targetUserId, p_amount: value.amount, p_request_id: idempotencyKey,
  });
  if (error) return NextResponse.json({ error: "Credit adjustment was not applied." }, { status: 409 });
  return NextResponse.json({ updated: true, balance });
}
