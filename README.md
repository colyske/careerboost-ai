# CareerBoost

Server-backed career tools, candidate accounts, credits, courses, and staff-managed opportunities. The chosen launch stack is Next.js on Vercel, Supabase Auth/Postgres, Paystack, and optional Google Gemini.

## Launch status

This is a production-oriented application build, but **not ready to accept customers until the operator completes the launch checklist**. No production accounts, domain, verified email sender, live payment prices, provider keys, support contact, legal terms, or data-region decisions were supplied. Paystack buttons remain disabled until bundle prices are set. Do not accept client data or payments until [`docs/production-runbook.md`](docs/production-runbook.md) is complete.

## Local development

Requires Node 22, npm, Docker, and the Supabase CLI.

```powershell
Copy-Item .env.example .env.local
npm ci
supabase start
supabase db reset
supabase test db
npm run check
npm run dev
```

Set the local Supabase URL and publishable key in `.env.local` using values printed by `supabase status`. Never put the Supabase secret key, Paystack secret, Gemini key, or cron secret in a `NEXT_PUBLIC_` variable or commit them.

## Services and trust boundaries

- Supabase Auth provides verified-email accounts and PKCE sessions. Postgres owns profiles, immutable credit ledger entries, payments, course progress, audit events, and opportunities. RLS is enabled and client roles do not receive privileged table/function access.
- Server routes use the Supabase secret key only for narrowly scoped server operations. Review every use of `createSupabaseAdminClient`; that client bypasses RLS.
- Paystack payment orders are created server-side. Callback and webhook flows both verify the transaction with Paystack and compare reference, status, amount, currency, and payer email. The database applies credits atomically and once. Webhook HMAC protects authenticity; provider API verification is still required.
- Gemini is optional and only receives selected profile fields after the candidate checks the consent box. No raw prompts or generated results are persisted by the app.
- Staff routes require an admin/owner role and AAL2 authenticator MFA. Role grants are owner-only and changes are audited.
- Account export and deletion are available in the signed-in dashboard. Payment reconciliation records are retained after identity deletion; retention windows require legal/operator approval.

## Checks

`npm run check` runs ESLint, TypeScript, unit tests, and a Next production build. `npm run test:db` runs Supabase pgTAP security checks against the local migrated database. GitHub Actions runs both suites and deploys through Vercel only after checks pass. Configure the repository secrets listed in the production runbook.

See [`docs/production-runbook.md`](docs/production-runbook.md) for migration rollout, secrets, operational alerts, data retention, backup/restore and incident recovery.


For a plain-language overview, read [the simple launch guide](docs/simple-launch-guide.md). For click-by-click setup, read [the detailed deployment guide](docs/deployment-guide.md).
