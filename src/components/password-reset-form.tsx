"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function PasswordResetForm() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    if (password !== form.get("confirmPassword")) { setMessage("The passwords do not match."); setBusy(false); return; }
    try {
      const { error } = await createSupabaseBrowserClient().auth.updateUser({ password });
      if (error) throw error;
      setMessage("Password updated. Taking you to your candidate hub…");
      setTimeout(() => router.replace("/dashboard"), 1000);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Password update failed."); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="space-y-4"><label className="block space-y-2 text-sm text-slate-300">New password<input name="password" type="password" autoComplete="new-password" minLength={12} required className="field" /></label><label className="block space-y-2 text-sm text-slate-300">Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} required className="field" /></label>{message && <p role="status" className="rounded-xl border border-slate-700 p-3 text-sm">{message}</p>}<button disabled={busy} className="gradient-bg w-full rounded-xl p-3 font-bold disabled:opacity-50">Update password</button></form>;
}
