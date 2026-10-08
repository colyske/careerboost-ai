import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Course completion record", robots: { index: false, follow: false } };

export default async function VerifyCoursePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^[a-f0-9]{24}$/i.test(code)) notFound();
  const admin = createSupabaseAdminClient();
  const { data: record, error } = await admin.from("course_completions")
    .select("completed_at,certificate_code,courses(title,category)")
    .eq("certificate_code", code.toLowerCase()).maybeSingle();
  if (error) throw new Error("Verification service is temporarily unavailable.");
  if (!record) notFound();
  const course = Array.isArray(record.courses) ? record.courses[0] : record.courses;
  if (!course) notFound();
  return <main className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-8"><Link href="/" className="text-sm text-indigo-200 underline">← CareerBoost</Link><section className="glass mt-6 rounded-3xl p-7 sm:p-10"><span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1.5 text-xs font-bold text-emerald-200"><span aria-hidden="true">✓</span> Record found</span><h1 className="mt-5 text-3xl font-extrabold">Course completion record</h1><p className="mt-3 text-sm leading-6 text-slate-300">This record confirms that a CareerBoost account completed the course quiz shown below. It does not verify identity, professional competence, or an accredited qualification.</p><dl className="mt-7 space-y-4 rounded-2xl border border-slate-700 bg-slate-950/40 p-5"><div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Course</dt><dd className="mt-1 font-bold">{course.title}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Category</dt><dd className="mt-1 text-sm text-slate-200">{course.category}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Completed</dt><dd className="mt-1 text-sm text-slate-200">{new Intl.DateTimeFormat("en", { dateStyle: "long", timeZone: "UTC" }).format(new Date(record.completed_at))} (UTC)</dd></div><div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Record code</dt><dd className="mt-1 break-all font-mono text-xs text-slate-300">{record.certificate_code}</dd></div></dl><p className="mt-5 text-xs leading-5 text-slate-500">This public page contains no account name, email, or other candidate profile data.</p></section></main>;
}
