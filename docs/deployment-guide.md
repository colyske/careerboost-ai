# CareerBoost: deployment guide for first-time operators

This guide takes you from the project folder to a tested staging site, then to production. Expect to set up four services: GitHub (stores the code), Supabase (accounts and database), Vercel (website hosting), and Paystack (payments). Gemini is optional (AI career tools).

**Do not accept real customers or payments until the final checklist below is complete.** The project contains no real provider credentials, approved prices, domain, or finalized legal/support information.

## 1. Open the project in your chosen folder

Use the project folder you chose:

```text
C:\My Web Sites\CareerBoost
```

This folder is outside the Codex-managed workspace and keeps the project in a simple location. Do not put the project in `node_modules` or a temporary folder. The `.env.local` secrets file stays out of Git because the project `.gitignore` excludes it.

Install Node.js 22, Git, and GitHub Desktop (optional but helpful). Open Windows Terminal or PowerShell from the Start menu (outside Codex). Go to the project folder, then run:

```powershell
cd 'C:\My Web Sites\CareerBoost'
node --version
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

The first command should show `v22...`. If `npm run build` still reports an access error in Windows Terminal, ask your IT administrator to check folder permissions or move the project to another folder where your Windows account has full access. The prior access error occurred inside Codex, so run these commands from Windows Terminal outside Codex.

## 2. Create the hosted services

Create accounts in GitHub, Vercel, Supabase, and Paystack. Turn on MFA for these accounts and limit access to trusted staff. Create **separate staging and production** Vercel and Supabase projects. Staging is the private test site; production is the real client site.

Choose Supabase regions only after deciding where clients are located and reviewing provider/data-transfer requirements. Use Supabase's hosted project for real traffic; the local Docker database is only for development and testing. The app's migrations are the numbered `.sql` files in `supabase/migrations`.

## 3. Create the private GitHub repository

On GitHub, create a **private, empty** repository named `careerboost-ai` (do not add a README or license yet). From PowerShell in the project folder, replace `YOUR-ACCOUNT` with your GitHub username or organization, then run:

```powershell
git init
git add .
git commit -m "Prepare CareerBoost"
git branch -M main
git remote add origin https://github.com/YOUR-ACCOUNT/careerboost-ai.git
git push -u origin main
git switch -c staging
git push -u origin staging
```

The `.env.local`, `node_modules`, and `.vercel` folders are excluded from Git. Do not paste secrets into source code, chat, GitHub issues, or commits. The initial GitHub checks run automatically; deployment remains off until you explicitly enable it in Step 6.

## 4. Set up Supabase (start with staging)

1. Create a Supabase **staging** project. In its project settings, copy the project URL, publishable key, secret key, project reference, and database password. Keep the secret key and database password private.
2. Install the Supabase CLI using the [official Windows setup instructions](https://supabase.com/docs/guides/local-development/cli/getting-started). To run local database tests you also need Docker Desktop running. Local Supabase is for development; it is not the hosted production database.
3. Sign in and connect the local folder to the staging database from PowerShell:

   ```powershell
   npx supabase login
   npx supabase link --project-ref YOUR_STAGING_PROJECT_REF
   npx supabase db push
   ```

   Type the staging database password if asked. `db push` applies the checked-in migrations; **never use `db reset` against a hosted project**. Supabase documents the CLI and migration flow [here](https://supabase.com/docs/guides/local-development/cli/getting-started).

4. Repeat the project creation and migration for production only after staging passes. Check the project reference carefully each time; staging and production are different databases.
5. In each Supabase project, configure a real email sender (SMTP), email confirmation, password recovery redirect URLs, CAPTCHA/abuse controls, and the final site URL. Allow these redirects:

   ```text
   https://YOUR-STAGING-DOMAIN/auth/callback
   https://YOUR-PRODUCTION-DOMAIN/auth/callback
   ```

   Replace the examples with your actual domains in the matching project. Set the password policy to at least 12 characters.
6. Create the owner account by signing up on the staging site after its first deployment and verifying the email. Set that account's `profiles.role` to `owner` once in the Supabase SQL editor, using the reviewed query in the [production runbook](production-runbook.md). Then sign in, open **Security / MFA**, and enroll an authenticator. Repeat carefully for production.

## 5. Set up Vercel and application settings

Create one Vercel project for staging and another for production. If you connect either project to GitHub, turn off Vercel's automatic Git deployments: this repository's GitHub Actions workflow is the release gate and performs the deployment after checks pass. Vercel's Git integration can otherwise deploy a push separately from that gate. Vercel supports repository deployments and project configuration in its [Git deployment guide](https://vercel.com/docs/git).

For each Vercel project, open **Settings → Environment Variables** and add the matching values below. Staging must use staging Supabase and Paystack test credentials; production must use production Supabase and Paystack live credentials.

| Setting | What to enter |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | The full public site URL, beginning `https://` |
| `NEXT_PUBLIC_SUPABASE_URL` | That environment's Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | That project's publishable key |
| `SUPABASE_SECRET_KEY` | That project's server-only secret key |
| `PAYSTACK_SECRET_KEY` | Paystack **test** key on staging; **live** key on production |
| `PAYSTACK_CURRENCY` | Your approved payment currency, such as `KES` |
| `PAYSTACK_STARTER_AMOUNT_SUBUNITS` | Approved Starter price as an integer in Paystack subunits |
| `PAYSTACK_PRO_AMOUNT_SUBUNITS` | Approved Pro price as an integer in Paystack subunits |
| `PAYSTACK_EXECUTIVE_AMOUNT_SUBUNITS` | Approved Executive price as an integer in Paystack subunits |
| `GEMINI_API_KEY` | Optional: a restricted Google AI API key; leave unset to disable AI generation |
| `GEMINI_MODEL` | A model enabled for your Google account |
| `CRON_SECRET` | A long random secret, unique per environment |

Add these to the matching **Preview** or **Production** environment in Vercel. Do not add secrets to names beginning `NEXT_PUBLIC_`; those values are visible in the browser. Vercel must rebuild after environment variables change.

## 6. Configure the GitHub deployment gate

The repository includes GitHub Actions to lint, type-check, test the app, run the database security tests, and deploy staging/production. Configure these in the repository's **Settings → Environments** and **Settings → Secrets and variables → Actions**:

1. Create environments named `preview` and `production`. Require a trusted human reviewer for both.
2. Add the preview Vercel credentials to `preview` secrets: `VERCEL_PREVIEW_TOKEN`, `VERCEL_PREVIEW_ORG_ID`, `VERCEL_PREVIEW_PROJECT_ID`.
3. Add the production Vercel credentials to `production` secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.
4. Vercel's team/project IDs are shown in the project settings or the local `.vercel/project.json` after linking the project. Make sure the preview IDs refer to the staging Vercel project and production IDs refer to the production project.
5. In **repository Actions variables** (not secrets), add `ENABLE_PREVIEW_DEPLOY` and `ENABLE_PRODUCTION_DEPLOY`, both set to `true`, only when the corresponding Vercel projects and secrets are ready. Until then, deployment jobs remain skipped.
6. Protect the `main` and `staging` branches: require review and the `quality` and `database` checks before merging. Keep deployment secrets limited to these reviewed branches/environments.

Push a reviewed change to `staging` to deploy the staging site. Fix any failed check before continuing. After the staging site passes the checks in Step 7, approve its deployment environment. Production deploys only from reviewed `main` after the same checks and production-environment approval.

## 7. Test the staging site

Before any public launch, verify each item using the staging domain:

- Create an account, receive and follow the confirmation email, sign in, reset the password, and sign out.
- Enroll the staging owner in authenticator MFA; confirm staff pages are denied without a verified second factor.
- Save a profile, export account data, try course lessons/quizzes, and confirm an incorrect quiz answer does not charge a credit.
- Confirm locked job listings hide employer details and the application URL; unlock one with a test credit and verify the credit history updates once.
- Enable Paystack **test mode**, register `https://YOUR-STAGING-DOMAIN/api/payments/webhook`, and test successful, declined, delayed, and duplicate deliveries. Confirm wrong/mismatched transactions never add credits. Paystack's official [webhook guide](https://paystack.com/docs/payments/webhooks/) explains event setup and retry behavior; check delivery results in its dashboard.
- Try account deletion with a pending test payment (it should be blocked), then retry after it is resolved/expired. Do not use production data for these tests.
- Check Vercel runtime logs, Supabase Auth/database logs, Paystack webhook delivery history, and the `/api/health` endpoint. Confirm the nightly data-retention job succeeds.

## 8. Go live

Do this only after staging passes and the business owner has approved prices, refunds, privacy/terms, support contact, data region/transfers, retention, and provider agreements. Configure a custom domain in Vercel, update the production site URL and Supabase redirect allow-list, and wait for DNS/TLS verification. Register `https://YOUR-PRODUCTION-DOMAIN/api/payments/webhook` in Paystack **live mode**. Apply the reviewed production database migrations, enable the production workflow variable, and approve the reviewed `main` deployment.

Before accepting customers, make one controlled low-value live payment/refund, reconcile it in Paystack and the credit ledger, confirm backup/PITR settings and a successful restore drill, and ensure someone is assigned to monitor and answer support requests. The [production runbook](production-runbook.md) contains the recovery steps and unresolved launch decisions. For Vercel domains, follow the [official domain guide](https://vercel.com/docs/domains/working-with-domains).

## If something fails

- **Email not arriving:** check Supabase's SMTP configuration, sender verification, spam folder, and allowed redirect URL.
- **Login/redirect loop:** check that `NEXT_PUBLIC_SITE_URL` and Supabase site/redirect URLs exactly match the active domain, including `https://`.
- **Payment buttons say “Not configured”:** one or more approved integer subunit prices are blank or invalid in that Vercel environment; redeploy after correcting them.
- **Payment succeeded but credits are missing:** do not manually edit balances. Check the Paystack reference and webhook delivery, Vercel function logs, and `payment_orders`; use the audited reconciliation process in the runbook.
- **Deployment job is skipped:** confirm the appropriate `ENABLE_*_DEPLOY` repository variable is `true`, branch is `staging` or `main`, and Vercel project secrets are present in the matching GitHub environment.
- **Build access denied:** build from a normal user-owned folder such as `C:\My Web Sites\CareerBoost`, using Windows Terminal outside the restricted Codex workspace.
