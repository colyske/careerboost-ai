import { redirect } from "next/navigation";
import { Dashboard } from "@/components/dashboard";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user?.email) redirect("/sign-in");
  const [{ data: profile, error: profileError }, { data: balance, error: balanceError }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", auth.user.id).single(),
    createSupabaseAdminClient().rpc("get_credit_balance", { p_user_id: auth.user.id }),
  ]);
  if (profileError || !profile || balanceError) redirect("/sign-in?error=profile");
  return <Dashboard initialProfile={profile} initialBalance={Number(balance)} email={auth.user.email} />;
}
