import Link from "next/link";
import { getSignedInUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const features = [
  ["01", "Career roadmaps", "Turn your career goals into a practical 90-day action plan."],
  ["02", "ATS resume drafts", "Create a structured resume from your own experience. No made-up employers or credentials."],
  ["03", "LinkedIn writing", "Shape headline and About-section drafts for the roles you want."],
  ["04", "STAR practice", "Get feedback on interview answers across Situation, Task, Action, and Result."],
];

export default async function Home() {
  const user = await getSignedInUser();
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-8">
      <header className="flex items-center justify-between border-b border-slate-700/70 py-4"><Link href="/" className="text-lg font-black tracking-tight">CareerBoost</Link><nav className="flex items-center gap-3 text-sm"><Link href="/privacy" className="hidden text-slate-300 hover:text-white sm:inline">Privacy</Link>{user ? <Link href="/dashboard" className="gradient-bg rounded-xl px-4 py-2 font-bold">Candidate hub</Link> : <><Link href="/sign-in" className="text-slate-200">Sign in</Link><Link href="/sign-up" className="gradient-bg rounded-xl px-4 py-2 font-bold">Get started</Link></>}</nav></header>
      <section className="relative my-10 overflow-hidden rounded-[2rem] border border-slate-700/70 bg-slate-900/65 px-6 py-14 shadow-2xl sm:px-12 sm:py-20"><div className="pointer-events-none absolute -right-20 -top-24 size-96 rounded-full bg-indigo-500/15 blur-3xl"/><div className="relative max-w-3xl"><span className="rounded-full border border-indigo-300/25 bg-indigo-400/10 px-3 py-1.5 text-xs font-semibold tracking-wide text-indigo-200">Career tools for work beyond borders</span><h1 className="mt-6 text-4xl font-black leading-tight tracking-tight sm:text-6xl">Make your next career move <span className="gradient-text">with a clearer plan.</span></h1><p className="mt-5 max-w-2xl text-base leading-7 text-slate-300">Organize your experience, practise your story, and explore practical next steps with AI-assisted tools that keep your data in your account.</p><div className="mt-8 flex flex-wrap gap-3"><Link href={user ? "/dashboard" : "/sign-up"} className="gradient-bg rounded-xl px-6 py-3.5 text-sm font-bold shadow-lg">{user ? "Open candidate hub" : "Create your account"}</Link><Link href="/sign-in" className="rounded-xl border border-slate-600 bg-slate-950/40 px-6 py-3.5 text-sm font-semibold">I already have an account</Link></div><p className="mt-5 max-w-2xl text-xs leading-5 text-slate-400">AI suggestions can be wrong. Check every claim and employment term yourself. CareerBoost does not promise jobs, salaries, or accredited qualifications.</p></div></section>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{features.map(([number,title,description]) => <article key={number} className="glass-card rounded-2xl p-5"><span className="text-xs font-bold text-cyan-300">{number}</span><h2 className="mt-4 font-bold">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-400">{description}</p></article>)}</section>
      <section className="glass mt-8 grid gap-6 rounded-2xl p-6 sm:grid-cols-3 sm:p-8"><div><h2 className="font-bold">Private candidate profile</h2><p className="mt-2 text-sm leading-6 text-slate-400">Your profile and credit activity are protected by authenticated database policies.</p></div><div><h2 className="font-bold">Transparent credit costs</h2><p className="mt-2 text-sm leading-6 text-slate-400">Each paid tool shows its credit cost. New accounts receive five starter credits.</p></div><div><h2 className="font-bold">Human-reviewed results</h2><p className="mt-2 text-sm leading-6 text-slate-400">Career drafts support your decisions. They do not replace professional advice or real-world verification.</p></div></section>
      <footer className="flex flex-wrap justify-between gap-3 py-8 text-xs text-slate-500"><span>CareerBoost · Your next career step</span><Link href="/privacy" className="underline">Privacy & data handling</Link></footer>
    </main>
  );
}
