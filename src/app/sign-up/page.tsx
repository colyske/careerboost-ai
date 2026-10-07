import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getSignedInUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SignUpPage() {
  if (await getSignedInUser()) redirect("/dashboard");
  return <main className="mx-auto flex w-full max-w-lg flex-1 items-center px-4 py-12"><section className="glass w-full rounded-3xl p-6 sm:p-9"><Link href="/" className="text-sm font-bold text-indigo-200">← CareerBoost</Link><h1 className="mt-6 text-3xl font-extrabold">Start with your goals</h1><p className="mb-7 mt-2 text-sm leading-6 text-slate-400">Create your account. We will send a confirmation email before your profile is activated.</p><AuthForm mode="sign-up"/><p className="mt-5 text-xs leading-5 text-slate-500">By creating an account you acknowledge our <Link href="/privacy" className="underline">data handling notice</Link>. Do not use this service until the final privacy notice and terms have been reviewed for your region.</p><p className="mt-4 text-sm text-slate-400">Already registered? <Link href="/sign-in" className="text-indigo-200 underline">Sign in</Link></p></section></main>;
}
