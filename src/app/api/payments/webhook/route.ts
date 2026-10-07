import { NextResponse } from "next/server";
import { verifyPaystackSignature, type PaystackTransaction } from "@/lib/payment-primitives";
import { applyVerifiedPayment } from "@/lib/paystack-server";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function POST(request: Request) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return NextResponse.json({ error: "Webhook is not configured." }, { status: 503 });
  const rawBody = await request.text();
  if (rawBody.length > 256_000) return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  if (!verifyPaystackSignature(rawBody, request.headers.get("x-paystack-signature"), secret)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let event: { event?: string; data?: { reference?: unknown } };
  try { event = JSON.parse(rawBody); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  if (event.event !== "charge.success") return NextResponse.json({ ok: true });
  const reference = event.data?.reference;
  if (typeof reference !== "string" || !/^gr_[a-f0-9]{32}$/.test(reference)) return NextResponse.json({ ok: true });

  try {
    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secret}` }, cache: "no-store", signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return NextResponse.json({ error: "Provider verification unavailable." }, { status: 503 });
    const result = await response.json() as { status?: boolean; data?: PaystackTransaction };
    if (!result.status || !result.data || result.data.reference !== reference || result.data.status !== "success") {
      return NextResponse.json({ error: "Transaction is not verified." }, { status: 409 });
    }
    await applyVerifiedPayment(reference, result.data);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Webhook processing will be retried." }, { status: 503 });
  }
}
