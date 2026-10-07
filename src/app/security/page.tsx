import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminMfa } from "@/components/admin-mfa";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const supabase = await createSupabaseServerClient();
  const { data: auth, error } = await supabase.auth.getUser();
  if (error || !auth.user) redirect("/sign-in");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", auth.user.id).single();
  return <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-8"><Link href="/dashboard" className="text-sm text-indigo-200 underline">← Candidate hub</Link><h1 className="mt-5 text-3xl font-extrabold">Account security</h1>{profile?.role === "admin" || profile?.role === "owner" ? <AdminMfa/> : <p className="mt-4 text-sm text-slate-300">Your account uses verified email and password-based sign-in. Administrators must enable authenticator MFA before staff controls are available.</p>}</main>;
}
