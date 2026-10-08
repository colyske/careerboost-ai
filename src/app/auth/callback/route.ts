import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");
  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const destination = next?.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
      const { data: auth } = await supabase.auth.getUser();
      if (auth.user) {
        const [{ data: profile }, { data: assurance }] = await Promise.all([
          supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle(),
          supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        ]);
        if ((profile?.role === "admin" || profile?.role === "owner") && assurance?.currentLevel !== "aal2") {
          return NextResponse.redirect(new URL("/security?next=%2Fdashboard", url.origin));
        }
      }
      return NextResponse.redirect(new URL(destination, url.origin));
    }
  }
  return NextResponse.redirect(new URL("/sign-in?error=confirmation", url.origin));
}
