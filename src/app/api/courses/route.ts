import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasValidOrigin } from "@/lib/request-security";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const [{ data: courses, error: coursesError }, { data: completions, error: completionError }] = await Promise.all([
    supabase.from("courses").select("id,title,category,duration_minutes,description,lesson,quiz_question,quiz_options").eq("active", true),
    supabase.from("course_completions").select("id,course_id,completed_at,certificate_code").eq("user_id", auth.user.id),
  ]);
  if (coursesError || completionError) return NextResponse.json({ error: "Courses are not available." }, { status: 503 });
  return NextResponse.json({ courses, completions }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const value = body as { courseId?: unknown; selectedOption?: unknown } | null;
  if (typeof value?.courseId !== "string" || !/^[a-z-]{3,60}$/.test(value.courseId) || !Number.isInteger(value.selectedOption)) {
    return NextResponse.json({ error: "Invalid quiz response." }, { status: 400 });
  }
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("complete_course", {
    p_user_id: auth.user.id, p_course_id: value.courseId, p_selected_option: value.selectedOption,
  });
  if (error?.message.includes("Insufficient credits")) return NextResponse.json({ error: "A course completion costs 1 credit." }, { status: 402 });
  if (error) return NextResponse.json({ error: "Course completion could not be recorded." }, { status: 503 });
  const result = data?.[0];
  if (!result?.completed) return NextResponse.json({ error: "That answer is not correct yet." }, { status: 422 });
  return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
}
