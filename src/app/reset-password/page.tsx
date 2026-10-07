import Link from "next/link";
import { PasswordResetForm } from "@/components/password-reset-form";

export default function ResetPasswordPage() {
  return <main className="mx-auto flex w-full max-w-lg flex-1 items-center px-4 py-12"><section className="glass w-full rounded-3xl p-6 sm:p-9"><Link href="/sign-in" className="text-sm font-bold text-indigo-200">← Sign in</Link><h1 className="mt-6 text-3xl font-extrabold">Set a new password</h1><p className="mb-7 mt-2 text-sm text-slate-400">Use at least 12 characters.</p><PasswordResetForm/></section></main>;
}
