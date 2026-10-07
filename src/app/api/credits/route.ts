import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const [{ data: entries, error }, { data: balance, error: balanceError }] = await Promise.all([
    supabase.from("credit_ledger").select("id,amount,reason,created_at").eq("user_id", auth.user.id)
      .order("created_at", { ascending: false }).limit(100),
    createSupabaseAdminClient().rpc("get_credit_balance", { p_user_id: auth.user.id }),
  ]);
  if (error || balanceError) return NextResponse.json({ error: "Credit history is not available." }, { status: 500 });
  return NextResponse.json({ balance, entries }, { headers: { "Cache-Control": "private, no-store" } });
}
