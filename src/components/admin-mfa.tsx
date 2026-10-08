"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function AdminMfa() {
  const [factorId, setFactorId] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("Checking authenticator status…");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      const supabase = createSupabaseBrowserClient();
      const [{ data: factors }, { data: assurance }] = await Promise.all([
        supabase.auth.mfa.listFactors(), supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      ]);
      const verified = factors?.totp?.find((factor) => factor.status === "verified");
      setFactorId(verified?.id || "");
      setStatus(verified ? assurance?.currentLevel === "aal2" ? "Authenticator MFA is enabled for this session." : "Authenticator enrolled. Sign out and back in with your code to establish a stronger session." : "Authenticator MFA is not enabled.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Could not check MFA."); }
  }

  useEffect(() => { void Promise.resolve().then(refresh); }, []);

  async function enroll() {
    setBusy(true); setStatus("");
    try {
      const { data, error } = await createSupabaseBrowserClient().auth.mfa.enroll({ factorType: "totp", friendlyName: "CareerBoost administrator" });
      if (error) throw error;
      setFactorId(data.id); setSecret(data.totp.secret); setStatus("Add this setup key to your authenticator app, then enter the current six-digit code.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "MFA setup failed."); }
    finally { setBusy(false); }
  }

  async function verify() {
    if (!factorId || !/^\d{6}$/.test(code)) { setStatus("Enter the six-digit code from your authenticator app."); return; }
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) throw challengeError;
      const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code });
      if (error) throw error;
      setSecret(""); setCode(""); await refresh();
    } catch (error) { setStatus(error instanceof Error ? error.message : "Authenticator verification failed."); }
    finally { setBusy(false); }
  }

  async function verifyForSession() {
    if (!factorId || !/^\d{6}$/.test(code)) { setStatus("Enter the six-digit code from your authenticator app."); return; }
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) throw challengeError;
      const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code });
      if (error) throw error;
      setCode(""); await refresh();
    } catch (error) { setStatus(error instanceof Error ? error.message : "Authenticator verification failed."); }
    finally { setBusy(false); }
  }

  return <section className="glass mt-5 rounded-2xl p-5 sm:p-7"><h2 className="text-xl font-bold">Administrator sign-in protection</h2><p className="mt-2 text-sm leading-6 text-slate-300">Staff actions require an authenticator app and a recent two-factor session. Keep the setup key private. If you lose access, use the organization recovery process; do not disable MFA from this page.</p><p role="status" className="mt-4 text-sm text-indigo-100">{status}</p>{!factorId && !secret && <button disabled={busy} onClick={enroll} className="gradient-bg mt-4 rounded-xl px-4 py-3 text-sm font-bold disabled:opacity-50">Set up authenticator</button>}{secret && <div className="mt-4 space-y-3"><label className="block space-y-2 text-xs text-slate-300">Authenticator setup key<span className="block select-all break-all rounded-lg border border-amber-300/30 bg-slate-950 p-3 font-mono text-sm text-amber-100">{secret}</span></label><label className="block space-y-2 text-xs text-slate-300">Six-digit code<input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" className="field max-w-48" /></label><button disabled={busy} onClick={verify} className="rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold disabled:opacity-50">Verify and enable</button></div>}{factorId && !secret && <div className="mt-4 space-y-3"><label className="block space-y-2 text-xs text-slate-300">Authenticator code for this session<input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" className="field max-w-48" /></label><button disabled={busy} onClick={verifyForSession} className="rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold disabled:opacity-50">Verify authenticator</button></div>}</section>;
}
