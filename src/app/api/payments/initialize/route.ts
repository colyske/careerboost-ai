import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCreditPackage } from "@/lib/payment-primitives";
import { hasValidOrigin } from "@/lib/request-security";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function POST(request: Request) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user?.email || !auth.user.email_confirmed_at) return NextResponse.json({ error: "Verify your email before making a purchase." }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const bundle = getCreditPackage((body as { bundle?: unknown } | null)?.bundle);
  if (!bundle) return NextResponse.json({ error: "Unknown credit bundle." }, { status: 400 });
  if (!bundle.amountSubunits) return NextResponse.json({ error: "Credit package pricing is not configured." }, { status: 503 });
  const secret = process.env.PAYSTACK_SECRET_KEY;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!secret || !siteUrl) return NextResponse.json({ error: "Payment service is not configured." }, { status: 503 });

  const admin = createSupabaseAdminClient();
  const { data: allowed, error: limitError } = await admin.rpc("check_payment_rate_limit", { p_user_id: auth.user.id });
  if (limitError) return NextResponse.json({ error: "Payment service is temporarily unavailable." }, { status: 503 });
  if (!allowed) return NextResponse.json({ error: "Too many payment attempts. Try again later." }, { status: 429 });

  const reference = `gr_${randomUUID().replaceAll("-", "")}`;
  const order = {
    reference, user_id: auth.user.id, bundle_id: bundle.id, credits: bundle.credits,
    amount_subunits: bundle.amountSubunits, currency: bundle.currency, email: auth.user.email,
  };
  const { error: insertError } = await admin.rpc("create_payment_order", {
    p_user_id: order.user_id, p_reference: order.reference, p_bundle_id: order.bundle_id,
    p_credits: order.credits, p_amount_subunits: order.amount_subunits,
    p_currency: order.currency, p_email: order.email,
  });
  if (insertError) return NextResponse.json({ error: "Could not create payment order." }, { status: 503 });

  try {
    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: auth.user.email,
        amount: bundle.amountSubunits,
        currency: bundle.currency,
        reference,
        callback_url: new URL("/payment/return", siteUrl).toString(),
        metadata: { bundle_id: bundle.id, credits: bundle.credits },
      }),
      signal: AbortSignal.timeout(12000),
      cache: "no-store",
    });
    const result = await response.json() as { status?: boolean; data?: { authorization_url?: string; reference?: string } };
    if (!response.ok || !result.status || !result.data?.authorization_url || result.data.reference !== reference) {
      throw new Error("Payment provider declined initialization.");
    }
    return NextResponse.json({ authorizationUrl: result.data.authorization_url }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    await admin.from("payment_orders").update({ status: "failed" }).eq("reference", reference).eq("status", "pending");
    return NextResponse.json({ error: "Could not start payment. No credits were charged." }, { status: 502 });
  }
}
