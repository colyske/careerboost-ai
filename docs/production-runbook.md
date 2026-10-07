# Production launch and operations runbook

The repository does not contain production credentials and must not receive real candidates, payments, or AI prompts until this checklist is completed by the service owner.

## 1. Accounts, ownership, and environments

1. Create separate Vercel and Supabase projects for staging and production. Choose regions after documenting client locations, provider subprocessors, cross-border transfers, latency, and applicable privacy requirements. Set a custom production domain and TLS. Keep Vercel Fluid Compute enabled or verify the configured 20–45 second function limits fit the selected plan; the AI route can wait up to 30 seconds for Gemini.
2. Keep production Supabase and Paystack credentials out of preview deployments. Restrict Vercel production access, Supabase organization/project roles, GitHub maintainers, and Paystack dashboard users to named staff with MFA. Use separate provider keys for staging and production.
3. Configure a verified Supabase SMTP sender, email confirmation, password recovery redirect URLs, site URL, and production allowed redirect URLs. Enable Supabase CAPTCHA/rate protection for public signups and review password/MFA policy. Create the organization owner account through verified signup, then promote that account once using the controlled SQL below; do not expose the service key to a browser.

```sql
update public.profiles set role = 'owner' where email = 'OWNER_EMAIL';
```

Run that once in the production SQL editor after verifying the address, then remove access to the SQL editor from routine operators. Require authenticator MFA for owner/admin accounts before any staff tools are used.

## 2. Supabase migrations and secrets

Apply migrations to staging first and verify migrations + pgTAP. Inspect schema changes and data impacts before production rollout. Use the Supabase Dashboard or a linked, protected production deployment workflow; never reset a live database.

Set the following in Vercel **Production** and **Preview** environments as appropriate. Keep production-only credentials out of Preview; use staging services there.

| Variable | Value / handling |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Exact canonical HTTPS app origin; no trailing path |
| `NEXT_PUBLIC_SUPABASE_URL` | Matching Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Matching project's publishable/anon key |
| `SUPABASE_SECRET_KEY` | Server-only secret key; rotate on exposure |
| `PAYSTACK_SECRET_KEY` | Staging/test key for Preview; live key for Production |
| `PAYSTACK_CURRENCY` | Supported settlement currency, e.g. `KES` |
| `PAYSTACK_STARTER_AMOUNT_SUBUNITS` | Positive integer in provider subunits, approved price |
| `PAYSTACK_PRO_AMOUNT_SUBUNITS` | Positive integer in provider subunits, approved price |
| `PAYSTACK_EXECUTIVE_AMOUNT_SUBUNITS` | Positive integer in provider subunits, approved price |
| `GEMINI_API_KEY` | Optional, server-only, restricted project key |
| `GEMINI_MODEL` | Explicit model available to the selected Google project |
| `CRON_SECRET` | Random high-entropy secret; cron endpoint expects `Bearer <secret>` |

Configure no production secrets in CI unless a deployment step requires them. The checks job uses inert build-only placeholders and must never connect to production data.

## 3. Paystack launch checks

1. Agree prices, refunds, expiry, and consumer disclosures before setting integer subunit prices. Confirm the settlement currency is enabled on the merchant account.
2. Register `https://YOUR_DOMAIN/api/payments/webhook` in Paystack. Configure a platform secret key and HTTPS. In Paystack test mode, exercise successful, declined, duplicate, forged signature, wrong amount/currency/email/reference, delayed webhook, callback-before-webhook, and webhook-before-callback cases.
3. Check that a repeated `charge.success` delivery adds credits once, and that an unknown, expired, or mismatched order never adds credits. Reconcile the Paystack dashboard against successful `payment_orders` and ledger events daily during launch.
4. After review, configure live keys and make a low-value controlled live purchase/refund before public launch. Do not store card data.

## 4. Data protection and retention

Before launch, publish the actual data controller, privacy contact, terms, refund policy, support channel, lawful basis, purposes, retention, user rights, incident contact, and cross-border transfer information. Have counsel/data-protection staff approve these for relevant jurisdictions (including Kenya where applicable). Decide whether collecting nationality/work authorization and LinkedIn URLs is necessary; minimize fields.

The app's current cleanup job redacts account email from failed/expired payment orders after 30 days and successful orders after 90 days. Account deletion removes Auth identity, profile and course completions, detaches ledger rows, and redacts order email, while retaining payment reference/amount/currency/provider transaction ID for reconciliation. These are implementation defaults, **not a determination of legally appropriate retention**. Confirm the schedule against tax, dispute, refund, and privacy duties; revise the migration and notice before launch if needed. Supabase backups and Vercel/Supabase operational logs may outlive in-app deletion. Set access and retention in each provider dashboard and document the exceptions to deletion.

Gemini requests are transient at the app layer; review Google's current API data terms and project settings before enabling it. Give candidates a privacy notice immediately before sending data. Avoid sending fields that are not needed. Configure Vercel/Supabase data processing terms and region consistently with the published notice.

## 5. GitHub CI and Vercel deployment

Protect `main` and `staging` with required `quality` and `database` checks, code review, and restricted bypass. Add GitHub environment secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` to the protected `production` environment, plus separate `VERCEL_PREVIEW_TOKEN`, `VERCEL_PREVIEW_ORG_ID`, and `VERCEL_PREVIEW_PROJECT_ID` secrets to `preview`. Require designated human reviewers for both deployment environments. Set repository Actions variables `ENABLE_PREVIEW_DEPLOY=true` and `ENABLE_PRODUCTION_DEPLOY=true` only after the matching Vercel project and secrets are configured. The `staging` branch deploys to a separate Vercel/Supabase staging project after both test jobs pass; production deploys from `main` after checks. Pull requests run checks without receiving deployment credentials. Since this workflow is the release gate, disable Vercel Git auto-deployments to avoid bypassing CI. Configure Vercel's production domain and deployment protection appropriately.

Review Vercel build/runtime logs after deployment. Confirm health by loading the landing page, sign up/confirmation/reset, profile save, data export/deletion in staging, courses, role restrictions, MFA, and test payment/webhook flows. The app intentionally has no production credentials or externally supplied legal content committed.

## 6. Monitoring and daily operations

- Alert on elevated 5xx/503, Supabase connection/DB saturation, payment verification failures, cron failures, Auth email delivery, unexpected AI spend, and Paystack reconciliation drift. Use `/api/health` as the basic Vercel/Supabase availability probe. Vercel cron execution does not replace monitoring; confirm the cleanup endpoint's successful run each day.
- Review Supabase Auth/security logs, Postgres advisor/security findings, GitHub alerts, Vercel deployment logs, and Paystack settlement/reconciliation each business day during launch.
- Keep a staffed support contact and documented on-call owner. Triage reports by severity and acknowledge payment/data deletion incidents promptly. Preserve relevant audit and provider logs without copying candidate content into tickets.
- Set provider spending caps/quotas and inspect AI rate limits, signup controls, and payment initialization limits before marketing traffic.

## 7. Backup, restore, and incident recovery

Before accepting clients, enable a Supabase backup/PITR plan appropriate to the business RPO/RTO and retention obligations. Confirm the exact plan, restore points, retention window, region, access controls, and recovery owner in the project console; do not assume a backup exists because the app has a daily cleanup job.

Conduct and document a restore drill to an isolated staging project before launch and quarterly thereafter. Restore the database, validate migrations, profiles/ledger/payment consistency and Auth linkage, run pgTAP, then run a staging login/payment smoke test. Record measured recovery time and data-loss point. Keep encrypted exports only if an approved retention policy and access controls exist.

For an incident: (1) assign an incident lead and stop risky traffic; disable Paystack checkout/Gemini via provider keys or app config, and suspend compromised staff; (2) preserve timestamps, Vercel/Supabase/Paystack logs and audit rows; (3) rotate the affected Vercel, Supabase, Paystack, Gemini, SMTP, GitHub, and cron credentials; (4) assess unauthorized access, payment/credit integrity, and notification/legal duties with the privacy lead; (5) recover into an isolated environment from a verified restore point and compare ledger/payment references against Paystack before reopening; (6) apply the fixed release with protected CI and verify alerts/cron. Never credit an account manually without a documented and audited reconciliation.

## Remaining launch decisions

- Production/staging project owners, regions, domain, SMTP sender, support and privacy contacts
- Approved bundle prices, refunds, currency and Paystack merchant/webhook setup
- Whether Gemini is enabled, chosen model, permitted data, and approved provider terms
- Legal review of privacy notice, terms, retention windows, and cross-border processing
- Backup/PITR tier, RPO/RTO, alert destinations, on-call ownership, and restore-drill evidence
- GitHub repository and Vercel project IDs/secrets, branch protections, and production access policy
