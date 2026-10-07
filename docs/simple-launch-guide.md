# CareerBoost: simple launch guide

This guide explains the launch in everyday terms. You will set up a staging (test) site first, make sure it works, and only then open the production (public) site to customers. Allow a few hours for account setup and DNS changes may take longer.

## What you need

- A Windows computer with Node.js 22 and Git installed.
- Accounts for GitHub (code storage), Supabase (accounts and database), Vercel (website hosting), and Paystack (payments).
- Access to the business email, domain registrar, and a phone with an authenticator app.
- Your approved prices, support email, privacy/terms wording, refund policy, and decision about where client data may be stored.

Turn on two-step sign-in for each service account. Do not put passwords or secret keys in the project files or send them in email/chat.

## 1. Check the project on your computer

Open **Windows Terminal** from the Start menu (not the terminal inside Codex). Paste these commands one at a time:

```powershell
cd 'C:\My Web Sites\CareerBoost'
node --version
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

`node --version` should begin with `v22`. If the build command reports “Access is denied” in Codex, run it in Windows Terminal as shown above. Codex's restricted environment denied Next.js access even at the chosen folder. If Windows Terminal also reports that error, ask your IT support person to check access to `C:\My Web Sites\CareerBoost`.

## 2. Save the project in GitHub

Create a **private** GitHub repository named `careerboost-ai`. This is a private home for the code; it does not make the website public. From Windows Terminal in the project folder, follow the Git commands in the [detailed deployment guide](deployment-guide.md#3-create-the-private-github-repository). Never add `.env.local` or any provider secret to GitHub.

## 3. Create a practice site first

Create a **staging** project in Supabase and a **staging** project in Vercel. Staging is a rehearsal version of the website; it is not automatically access-restricted, so enable Vercel deployment protection and use test data only. Use Paystack test keys there so test purchases cannot charge real cards or mobile money. Use the detailed guide to enter the settings safely and connect the services.

The project contains database changes under `supabase/migrations`. Apply them to staging with the Supabase CLI as shown in the [Supabase setup steps](deployment-guide.md#4-set-up-supabase-start-with-staging). Do not run a database reset against a hosted project.

## 4. Let the checks deploy staging

The GitHub pipeline checks the code, runs application tests and database security tests, then deploys only when you turn on the staging gate and approve the staging environment. The [pipeline setup section](deployment-guide.md#6-configure-the-github-deployment-gate) lists the exact switches and secret names. These secrets are stored in GitHub and Vercel settings; they do not belong in source files.

Open the staging website and follow the [staging checklist](deployment-guide.md#7-test-the-staging-site). Verify sign-up, confirmation email, password reset, MFA, profile and data export, course/quiz behavior, job unlocks, test payments, account deletion, logs, and the scheduled cleanup job.

## 5. Prepare the public website

Only after staging works, create separate **production** Supabase and Vercel projects. Set the real domain, verified email sender, approved prices, Paystack live credentials, privacy/terms, support contact, refund process, data location, and retention rules. Have the responsible business/legal person approve the privacy and payment terms before collecting client information.

Follow the [go-live steps](deployment-guide.md#8-go-live) and the [production runbook](production-runbook.md). Before launch, confirm backups are enabled and someone has successfully practised restoring them. Make one controlled low-value live payment and refund and check that it matches the payment record and credit history.

## 6. Publish and keep watch

The public release comes from the reviewed `main` branch after GitHub checks pass and a trusted reviewer approves the production deployment. Once the site is live, check Vercel, Supabase, Paystack, and scheduled-job logs every day at first. Keep a named person responsible for support, refunds, security alerts, and recovery.

## What “ready” means

The code and release pipeline are prepared, but the service is **not live or cleared to accept clients yet**. Hosting accounts, credentials, prices, domain, approved policies, provider configuration, and a successful backup restore must be supplied and verified by the operator. The [production runbook](production-runbook.md) tracks these final decisions and recovery procedures.