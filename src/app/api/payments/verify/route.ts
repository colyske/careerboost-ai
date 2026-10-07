import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { applyVerifiedPayment, verifyPaystackTransaction } from "@/lib/paystack-server";
import { hasValidOrigin } from "@/lib/request-security";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function POST(request: Request) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user?.email || !auth.user.email_confirmed_at) return NextResponse.json({ error: "Verified sign-in required." }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const reference = (body as { reference?: unknown } | null)?.reference;
  if (typeof reference !== "string" || !/^gr_[a-f0-9]{32}$/.test(reference)) {
    return NextResponse.json({ error: "Invalid payment reference." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: order, error: orderError } = await admin.from("payment_orders").select("*").eq("reference", reference).single();
  if (orderError || !order || order.user_id !== auth.user.id) return NextResponse.json({ error: "Payment order not found." }, { status: 404 });
  if (order.status === "success") return NextResponse.json({ verified: true });
  try {
    const transaction = await verifyPaystackTransaction(reference);
    await applyVerifiedPayment(reference, transaction);
    return NextResponse.json({ verified: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ verified: false, error: "Payment could not be verified yet. Your balance will update after confirmation." }, { status: 503 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Use POST with an authenticated payment reference." }, { status: 405, headers: { Allow: "POST" } });
}
