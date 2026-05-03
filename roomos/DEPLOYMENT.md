# RoomOS Phase 1A — Manual Deployment Guide

This document covers the parts of Phase 1A deployment that require human credentials and external service provisioning. Run these once after Phase 1A code lands on `main`.

## 1. Provision Clerk

1. Sign in at <https://dashboard.clerk.com>.
2. Create an application named "RoomOS — Production" (Email + Password initially; enable Organizations later when needed for multi-tenant).
3. From "API Keys" copy:
   - `Publishable key` → goes into `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `Secret key` → goes into `CLERK_SECRET_KEY`
4. Repeat the above for a separate "RoomOS — Local Dev" app and paste those keys into `roomos/apps/web/.env.local` (replacing the `pk_test_REPLACE_ME` / `sk_test_REPLACE_ME` placeholders).

## 2. Provision Railway

1. Sign in at <https://railway.com>.
2. Create a new project named "roomos-prod".
3. Add a Postgres service: **+ New → Database → Postgres**. Wait for provisioning.
4. Add a service from your GitHub repo: **+ New → GitHub Repo → select the roomos repo**. Railway will detect Next.js via the `railway.json` at the repo root.
5. In the web service → **Variables**, set:
   ```
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<your prod publishable key>
   CLERK_SECRET_KEY=<your prod secret key>
   CLERK_WEBHOOK_SECRET=<set in step 3 below>
   NEXT_PUBLIC_APP_URL=https://<railway-generated-domain>
   ```
6. Hit Deploy. The first build takes ~3–5 minutes.

## 3. Set up the production Clerk webhook

1. In Clerk dashboard, switch to the **production** instance.
2. **Configure → Webhooks → Add endpoint.**
3. URL: `https://<your-railway-domain>/api/clerk-webhook`
4. Events: `user.created`, `user.updated`, `user.deleted`.
5. Copy the signing secret (starts with `whsec_`).
6. Update Railway env var `CLERK_WEBHOOK_SECRET` with this value. Railway auto-redeploys on env var change.

## 4. Smoke test

1. Open `https://<railway-domain>/`. Expect the cream landing page with the gold "Sign in" CTA.
2. Click **Sign in** → Clerk hosted UI → sign up with a real email.
3. Land on `/rooms`. Expect the **No rooms — yet.** empty state.
4. Open Railway's Postgres service → **Data → `team_users`**. Confirm a row exists for the new user with `role: AGENT`.
5. Sign out via the user menu and confirm redirect to landing.

## 5. Local dev quickstart

After Clerk keys are in `roomos/apps/web/.env.local`:
```bash
cd roomos
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```
Open <http://localhost:3000>.

## What's deferred to Phase 1B+

- The PadSplit scraper (Plan 1B) — runs on Jordan's Mac Studio as a launchd agent, not on Railway.
- Discovery scrape, room population, member financials — Plan 1B and onward.
- Owner mapping, team invites in-app — Plan 1D.
- Sentry / Slack alerts — Plan 1B once the worker exists and starts producing failures worth alerting on.

## Phase 1A success criteria (from spec section 10)

Phase 1A ships when:
1. Bootstrap (sign in → Clerk webhook syncs team_users) works end-to-end on Railway.
2. The dashboard shows the brand-correct empty state for a fresh sign-up.
3. The 5 team members can sign in via Clerk with `agent` role gates applied (admin upgrade is manual via Settings → Team — UI lands in Plan 1D).
