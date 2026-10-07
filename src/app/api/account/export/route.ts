import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const [{ data: profile, error: profileError }, { data: credits, error: creditError }, { data: completions, error: completionError }, { data: orders, error: orderError }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", auth.user.id).single(),
    supabase.from("credit_ledger").select("amount,reason,created_at").eq("user_id", auth.user.id).order("created_at", { ascending: false }),
    supabase.from("course_completions").select("course_id,completed_at,certificate_code").eq("user_id", auth.user.id),
    createSupabaseAdminClient().from("payment_orders").select("reference,bundle_id,credits,amount_subunits,currency,status,created_at,verified_at").eq("user_id", auth.user.id),
  ]);
  if (profileError || creditError || completionError || orderError) return NextResponse.json({ error: "Export is not available." }, { status: 500 });
  return new NextResponse(JSON.stringify({ exportedAt: new Date().toISOString(), account: { email: auth.user.email, createdAt: auth.user.created_at }, profile, creditHistory: credits, courseCompletions: completions, paymentOrders: orders }, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": 'attachment; filename="careerboost-account-export.json"', "Cache-Control": "private, no-store" },
  });
}
