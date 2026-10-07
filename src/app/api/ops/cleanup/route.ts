import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  const received = request.headers.get("authorization") || "";
  const expectedHeader = expected ? `Bearer ${expected}` : "";
  const a = Buffer.from(received);
  const b = Buffer.from(expectedHeader);
  if (!expected || a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const admin = createSupabaseAdminClient();
  const [{ data: redacted, error: retentionError }, { error: expireError }] = await Promise.all([
    admin.rpc("anonymize_expired_payment_orders"),
    admin.from("payment_orders").update({ status: "expired" }).eq("status", "pending").lt("expires_at", new Date().toISOString()),
  ]);
  if (retentionError || expireError) return NextResponse.json({ error: "Retention job failed." }, { status: 503 });
  return NextResponse.json({ ok: true, redactedOrders: redacted ?? 0, expiredOrdersChecked: true });
}
