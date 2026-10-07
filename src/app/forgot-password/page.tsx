import Link from "next/link";
import { AuthForm } from "@/components/auth-form";

export default function ForgotPasswordPage() {
  return <main className="mx-auto flex w-full max-w-lg flex-1 items-center px-4 py-12"><section className="glass w-full rounded-3xl p-6 sm:p-9"><Link href="/sign-in" className="text-sm font-bold text-indigo-200">← Sign in</Link><h1 className="mt-6 text-3xl font-extrabold">Reset your password</h1><p className="mb-7 mt-2 text-sm text-slate-400">We will email you a secure one-time link.</p><AuthForm mode="reset"/></section></main>;
}
