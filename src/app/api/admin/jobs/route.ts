import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasValidOrigin } from "@/lib/request-security";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: auth, error } = await supabase.auth.getUser();
  if (error || !auth.user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", auth.user.id).single();
  if (profile?.role !== "admin" && profile?.role !== "owner") return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance?.currentLevel !== "aal2") return NextResponse.json({ error: "Administrator MFA is required for staff actions." }, { status: 403 });
  const { data: jobs, error: jobsError } = await createSupabaseAdminClient().from("job_listings")
    .select("id,title,company,region,salary_range,description,required_skills,application_url,active,created_at")
    .order("created_at", { ascending: false }).limit(100);
  if (jobsError) return NextResponse.json({ error: "Opportunity directory is not available." }, { status: 503 });
  return NextResponse.json({ jobs: (jobs ?? []).map((job) => ({ ...job, unlocked: true, matchScore: 0 })) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", auth.user.id).single();
  if (profile?.role !== "admin" && profile?.role !== "owner") return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance?.currentLevel !== "aal2") return NextResponse.json({ error: "Administrator MFA is required for staff actions." }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const value = body as Record<string, unknown> | null;
  const admin = createSupabaseAdminClient();
  if (value?.action === "archive") {
    if (typeof value.jobId !== "string" || !/^[\da-f-]{36}$/i.test(value.jobId)) return NextResponse.json({ error: "Invalid opportunity." }, { status: 400 });
    const { error } = await admin.rpc("admin_archive_job", { p_actor_id: auth.user.id, p_job_id: value.jobId });
    if (error) return NextResponse.json({ error: "Opportunity could not be archived." }, { status: 409 });
    return NextResponse.json({ archived: true });
  }
  const title = typeof value?.title === "string" ? value.title.trim() : "";
  const company = typeof value?.company === "string" ? value.company.trim() : "";
  const region = typeof value?.region === "string" ? value.region.trim() : "";
  const salaryRange = typeof value?.salaryRange === "string" ? value.salaryRange.trim() : "";
  const description = typeof value?.description === "string" ? value.description.trim() : "";
  const applicationUrl = typeof value?.applicationUrl === "string" ? value.applicationUrl.trim() : "";
  const skills = typeof value?.requiredSkills === "string" ? value.requiredSkills.split(",").map((skill) => skill.trim()).filter(Boolean).slice(0, 30) : [];
  if (title.length < 4 || title.length > 180 || company.length < 2 || company.length > 180 || region.length < 2 || region.length > 180 || salaryRange.length > 180 || description.length < 20 || description.length > 5000 || !/^https:\/\/[^\s]{1,2000}$/i.test(applicationUrl) || skills.some((skill) => skill.length > 80)) {
    return NextResponse.json({ error: "Check the required fields and HTTPS application link." }, { status: 400 });
  }
  const { error } = await admin.rpc("admin_create_job", {
    p_actor_id: auth.user.id, p_title: title, p_company: company, p_region: region,
    p_salary_range: salaryRange, p_description: description, p_required_skills: skills, p_application_url: applicationUrl,
  });
  if (error) return NextResponse.json({ error: "Opportunity could not be published." }, { status: 400 });
  return NextResponse.json({ created: true });
}
