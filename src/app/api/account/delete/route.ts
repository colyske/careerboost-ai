import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasValidOrigin } from "@/lib/request-security";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user?.email) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Confirm account deletion." }, { status: 400 }); }
  const confirmation = (body as { email?: unknown } | null)?.email;
  if (typeof confirmation !== "string" || confirmation.trim().toLowerCase() !== auth.user.email.toLowerCase()) {
    return NextResponse.json({ error: "Enter your account email to confirm deletion." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { error: expireError } = await admin.from("payment_orders").update({ status: "expired" })
    .eq("user_id", auth.user.id).eq("status", "pending").lt("expires_at", new Date().toISOString());
  if (expireError) return NextResponse.json({ error: "Could not check pending payments. Try again shortly." }, { status: 503 });
  const { data: pendingOrders, error: pendingError } = await admin.from("payment_orders").select("reference")
    .eq("user_id", auth.user.id).eq("status", "pending").limit(1);
  if (pendingError) return NextResponse.json({ error: "Could not check pending payments. Try again shortly." }, { status: 503 });
  if (pendingOrders?.length) return NextResponse.json({ error: "Resolve or wait for your pending Paystack payment before deleting this account." }, { status: 409 });
  const { error: purgeError } = await admin.rpc("purge_user_data", { p_user_id: auth.user.id });
  if (purgeError?.message.includes("Pending payment")) return NextResponse.json({ error: "Resolve or wait for your pending Paystack payment before deleting this account." }, { status: 409 });
  if (purgeError) return NextResponse.json({ error: "Account data could not be prepared for deletion." }, { status: 503 });
  const { error: deleteError } = await admin.auth.admin.deleteUser(auth.user.id);
  if (deleteError) return NextResponse.json({ error: "Personal data has been removed. Identity deletion is pending; contact support to finish." }, { status: 503 });
  await supabase.auth.signOut();
  return NextResponse.json({ deleted: true });
}
