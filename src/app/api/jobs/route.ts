import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasValidOrigin } from "@/lib/request-security";

export const dynamic = "force-dynamic";

type JobRow = {
  id: string; title: string; company: string; region: string; salary_range: string;
  description: string; required_skills: string[]; application_url: string | null;
  unlocked: boolean; created_at: string;
};

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { data: profile, error: profileError } = await supabase.from("profiles").select("skills").eq("id", auth.user.id).single();
  if (profileError) return NextResponse.json({ error: "Candidate profile is not available." }, { status: 503 });
  const { data: jobs, error } = await createSupabaseAdminClient().rpc("list_available_jobs", { p_user_id: auth.user.id });
  if (error) return NextResponse.json({ error: "Opportunity feed is not available." }, { status: 503 });
  const candidateSkills = new Set(String(profile.skills || "").split(",").map((skill) => skill.trim().toLowerCase()).filter(Boolean));
  const ranked = ((jobs ?? []) as JobRow[]).map((job) => {
    const required = (job.required_skills as string[] || []).map((skill) => skill.toLowerCase());
    const matched = required.filter((skill) => candidateSkills.has(skill)).length;
    return { ...job, matchScore: required.length ? Math.round(matched / required.length * 100) : 0 };
  }).sort((a, b) => b.matchScore - a.matchScore);
  return NextResponse.json({ jobs: ranked }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  if (!hasValidOrigin(request)) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }
  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const jobId = (body as { jobId?: unknown } | null)?.jobId;
  if (typeof jobId !== "string" || !/^[\da-f-]{36}$/i.test(jobId)) return NextResponse.json({ error: "Invalid opportunity." }, { status: 400 });
  const { data: balance, error } = await createSupabaseAdminClient().rpc("unlock_job", { p_user_id: auth.user.id, p_job_id: jobId });
  if (error?.message.includes("Insufficient credits")) return NextResponse.json({ error: "Unlocking employer details costs 1 credit." }, { status: 402 });
  if (error) return NextResponse.json({ error: "Opportunity could not be unlocked." }, { status: 409 });
  return NextResponse.json({ unlocked: true, balance }, { headers: { "Cache-Control": "no-store" } });
}
