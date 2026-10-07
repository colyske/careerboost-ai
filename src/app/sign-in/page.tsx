import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getSignedInUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  if (await getSignedInUser()) redirect("/dashboard");
  return <main className="mx-auto flex w-full max-w-lg flex-1 items-center px-4 py-12"><section className="glass w-full rounded-3xl p-6 sm:p-9"><Link href="/" className="text-sm font-bold text-indigo-200">← CareerBoost</Link><h1 className="mt-6 text-3xl font-extrabold">Welcome back</h1><p className="mb-7 mt-2 text-sm text-slate-400">Sign in to open your private candidate hub.</p><AuthForm mode="sign-in"/><div className="mt-5 flex flex-wrap justify-between gap-3 text-sm"><Link href="/forgot-password" className="text-slate-300 underline">Forgot password?</Link><Link href="/sign-up" className="text-indigo-200 underline">Create account</Link></div></section></main>;
}
