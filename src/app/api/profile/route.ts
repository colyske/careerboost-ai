import { NextResponse } from "next/server";
import { hasValidOrigin } from "@/lib/request-security";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { data, error } = await supabase.from("profiles").select("*").eq("id", auth.user.id).single();
  if (error) return NextResponse.json({ error: "Profile is not available." }, { status: 500 });
  return NextResponse.json({ profile: data }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: Request) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid profile." }, { status: 400 });

  const allowed = ["full_name", "linkedin_url", "target_role", "target_region", "target_salary", "languages", "nationality", "skills", "resume_bio"] as const;
  const update: Record<string, string> = {};
  for (const field of allowed) {
    const value = (body as Record<string, unknown>)[field];
    if (value !== undefined) {
      if (typeof value !== "string" || value.length > 8000) {
        return NextResponse.json({ error: `Invalid ${field}.` }, { status: 400 });
      }
      update[field] = value.trim();
    }
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "No profile fields supplied." }, { status: 400 });
  if (update.linkedin_url && !/^https:\/\/(www\.)?linkedin\.com\//i.test(update.linkedin_url)) {
    return NextResponse.json({ error: "Enter a valid HTTPS LinkedIn profile URL." }, { status: 400 });
  }

  const { data, error } = await supabase.from("profiles").update(update).eq("id", auth.user.id).select("*").single();
  if (error) return NextResponse.json({ error: "Profile could not be saved." }, { status: 500 });
  return NextResponse.json({ profile: data }, { headers: { "Cache-Control": "private, no-store" } });
}
