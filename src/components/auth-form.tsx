"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" | "reset" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [mfaChallenge, setMfaChallenge] = useState<{ factorId: string; challengeId: string } | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const isSignUp = mode === "sign-up";
  const isReset = mode === "reset";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim().toLowerCase();
      const password = String(form.get("password") || "");
    const fullName = String(form.get("fullName") || "").trim();
    try {
      const supabase = createSupabaseBrowserClient();
      if (mfaChallenge) {
        const { error } = await supabase.auth.mfa.verify({ ...mfaChallenge, code: mfaCode });
        if (error) throw error;
        router.replace("/dashboard"); router.refresh();
      } else if (isReset) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback?next=/reset-password` });
        if (error) throw error;
        setMessage("If that account exists, a password-reset link has been sent.");
      } else if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (error) throw error;
        setMessage("Check your email for a confirmation link. Your account will be ready after verification.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        const [{ data: assurance }, { data: factors }] = await Promise.all([
          supabase.auth.mfa.getAuthenticatorAssuranceLevel(), supabase.auth.mfa.listFactors(),
        ]);
        if (assurance?.nextLevel === "aal2" && assurance.currentLevel !== "aal2") {
          const factor = factors?.totp?.find((item) => item.status === "verified");
          if (!factor) throw new Error("This account requires authenticator MFA. Contact your organization owner to restore access.");
          const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: factor.id });
          if (challengeError) throw challengeError;
          setMfaChallenge({ factorId: factor.id, challengeId: challenge.id });
          setMessage("Enter the six-digit code from your authenticator app.");
        } else {
          router.replace("/dashboard"); router.refresh();
        }
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sign-in could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" aria-label={isSignUp ? "Create account" : "Sign in"}>
      {!mfaChallenge && isSignUp && <label className="block space-y-2 text-sm text-slate-300">Full name<input name="fullName" autoComplete="name" maxLength={160} required className="field" /></label>}
      {!mfaChallenge && <label className="block space-y-2 text-sm text-slate-300">Email<input name="email" type="email" autoComplete="email" required className="field" /></label>}
      {!mfaChallenge && !isReset && <label className="block space-y-2 text-sm text-slate-300">Password<input name="password" type="password" autoComplete={isSignUp ? "new-password" : "current-password"} minLength={12} required className="field" /></label>}
      {mfaChallenge && <label className="block space-y-2 text-sm text-slate-300">Authenticator code<input value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" minLength={6} maxLength={6} required className="field" /></label>}
      {isSignUp && <p className="text-xs leading-5 text-slate-400">Use at least 12 characters. Email verification is required before sign-in.</p>}
      {message && <p role="status" className="rounded-xl border border-slate-700 bg-slate-950/70 p-3 text-sm text-slate-200">{message}</p>}
      <button disabled={busy} className="gradient-bg w-full rounded-xl px-4 py-3 font-bold text-white shadow-lg disabled:cursor-wait disabled:opacity-60">
        {busy ? "Please wait…" : mfaChallenge ? "Verify code" : isSignUp ? "Create account" : isReset ? "Send reset link" : "Sign in"}
      </button>
    </form>
  );
}
