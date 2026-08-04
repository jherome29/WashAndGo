# HANDOFF — Wash & Go Auto Salon

Pick-up document for a new Claude session. Read this top to bottom before doing anything else.

---

## What This Project Is

Full-stack booking platform for **Wash & Go Auto Salon (Baliwag Branch)**, including the **Club Wash & Go** loyalty membership program and a full CI/CD pipeline.

- **Frontend:** React 18 + Vite + TypeScript (port 3000) — `wash-and-go-SE2/`
- **Backend:** NestJS REST API (port 3001, prefix `/api`) — `wash-and-go-backend/`
- **Database / Auth / Storage:** Supabase (project ref: `kgpwahbpjrnwswwevmlt`)
- **Live frontend:** https://washandgo.autosalon.workers.dev
- **Live backend:** https://washandgoautosalon.up.railway.app/api
- **Deploy trigger:** GitHub Actions CD workflow (`.github/workflows/cd.yml`), triggered on CI success — push to `develop` deploys to staging, push to `main` deploys to production (Cloudflare Workers for frontend, Railway for backend)

```bash
npm run dev   # from repo root — starts backend :3001 and frontend :3000 concurrently
```

---

## Environment Notes

- **Windows machine, Node.js v24, corporate SSL inspection** — all backend npm scripts already include `cross-env NODE_OPTIONS=--use-system-ca`. Do not remove this flag or Supabase connections will break.
- **Brevo email:** `BREVO_API_KEY` is NOT set locally. The backend auto-confirms email on signup when the key is absent. Email only works on the deployed Railway backend.
- **Rate limiter / throttle:** Storage uploads are throttled 5/5 min per IP. If you hit 429 during testing, restart the backend.
- **Commit policy:** the user approves every commit and push individually — one approval never carries forward to later commits. Never run `git commit`/`git add`/`git push` without asking first, every single time.

---

## Key Reference Documents

| File | What it covers |
|---|---|
| **`docs/SYSTEM.md`** | Complete logic for every feature — read before touching any cross-layer code, including the Club Wash & Go membership program (§18) |
| **`docs/USER-STORIES.md`** | Manual QA checklist — user journeys/scenarios for guests, customers, and admins, including regression scenarios for previously-fixed bugs |
| **`wash-and-go-backend/CLAUDE.md`** | Backend module map, Supabase client, auth guards, email patterns, security checklist |
| **`wash-and-go-SE2/CLAUDE.md`** | Frontend view routing, auth state machine, API layer, Manila timezone |
| **`docs/PENDING.md`** | All remaining and planned work |
| **`docs/CICD.md`** / **`docs/CD-BLUEPRINT.md`** / **`docs/NEXT-STEPS.md`** | CI/CD and CD pipeline design, plus any remaining setup/verification items |

---

## Current Git State

**Repo:** development happens on `https://github.com/jherome29/WashAndGo` (git remote `washandgo`), **not** the original repo. The original repo (`https://github.com/dreiiiiim/wash-and-go-front-back`, remote `origin`, branch `post-defense`) is left untouched intentionally — do not push, branch from, or otherwise modify it.

**Branch model:** 2 long-lived branches — `feature/* → develop → main`. `develop` gates merges via CI (lint, tests, security, SonarQube quality gate); `develop → main` gates production deploys. A large number of feature/fix branches have already been merged in — memberships, CI/CD, the CD pipeline itself, schedule management, security hardening, and various smaller fixes.

**Working tree:** currently on `fix/slot-capacity-and-baliwag-rename`, 2 commits ahead of `washandgo/develop`, not yet pushed/PR'd. Recent commits on this branch:
- `fix: hold the time slot while a booking awaits proof resubmission` — a declined booking (`REUPLOAD_REQUIRED`) now keeps holding its slot so another customer can't take it out from under the original customer while they're still fixing/resubmitting proof.
- `fix: correct branch name spelling from Baliuag to Baliwag` — repo-wide typo fix.

Check `git status` / `git log` at the start of a new session rather than trusting this snapshot — it goes stale fast.

### Required Supabase changes (verify in dashboard if picking up a fresh environment)
- `password_reset_attempts` table — used by `auth.service.ts` for rate limiting
- `admin_audit_logs` table — used by `AuditLogService`
- `bookings.status` CHECK constraint must include `REUPLOAD_SUBMITTED`
- `branch_schedules.closed_days`, corrected `services.duration_hours` (schedule management feature)
- Club Wash & Go membership tables/columns (`memberships`, `membership_vehicles`, `services.membership_discount_pct`, `bookings.membership_id`/`membership_discount_type`/`membership_visit_counted`, `memberships.expiring_reminder_sent_at`)

All of the above should already be applied in the production Supabase project (`kgpwahbpjrnwswwevmlt`) since the corresponding features are live — this list matters mainly when setting up a new (e.g. staging) Supabase project from scratch.

---

## Major Features Implemented

### Club Wash & Go Membership Program ✅
Full loyalty membership feature — issued only to existing accounts (account-first "Make a Member" admin flow), up to 3 vehicles per membership, FREE_WASH → FIRST_WASH → CATEGORY_PERCENT discount priority, shared visit counter across vehicles (GROOMING/car-wash visits only), free wash credit every 10th visit, daily expiry cron with reminder/expired emails, full admin audit logging. Extended with a manual walk-in visit tracker (`+`/`−` stepper in the admin Memberships panel) for washes that never go through the booking system. See `docs/SYSTEM.md` §18 for complete logic and `wash-and-go-backend/CLAUDE.md` / `wash-and-go-SE2/CLAUDE.md` for module-level detail.

### CI/CD Pipeline ✅ (both CI and CD)
GitHub Actions CI on the new repo: backend (ESLint, Jest+coverage, Nest build), frontend (ESLint, `tsc --noEmit`, Vitest+coverage, Vite build), security (gitleaks + npm audit), SonarQube scan + quality gate, `ci-ok` aggregate check, plus a separate CodeQL (SAST) workflow. CD is also implemented (`.github/workflows/cd.yml`, not a stub): triggered on CI success, it promotes `develop` → staging and `main` → production through migrate → deploy-backend (Railway) → deploy-frontend (Cloudflare Workers) → smoke-test stages, using GitHub Environments for per-environment secrets and a required reviewer on production. See `docs/CICD.md` and `docs/CD-BLUEPRINT.md`.

### Admin Schedule & Availability Management ✅
Settings tab UI (`ScheduleSettings.tsx`): operating hours, closed weekdays (`branch_schedules.closed_days` jsonb), holidays & closures, custom/half-day hours — all server-side validated and audit-logged. Customer calendar (`ScheduleSelection.tsx`) greys out closed dates with reasons. Multi-day service durations (≥24h) skip the same-day "fits before close" check. Guest status-token expiry auto-extends around closed days.

### Security Hardening ✅
CSP + security headers, HSTS, 10 KB body limit, file upload validation (extension + MIME + size + path traversal), error sanitization, DB-backed password reset rate limit, honeypot on booking creation, admin audit log.

### Guest Booking Flow ✅
No auth gate — guests book without an account, look up status by Booking ID only, get a "Guest" badge in admin, and receive a dedicated payment-declined email with reupload instructions. Seamless reupload directly from the Check Status page (no token/email link needed). A declined booking's slot stays held (not released) until the customer fixes their proof or an admin cancels.

### Recent smaller fixes (post-membership)
- Dedicated "Payment Proof Resubmitted" admin email (`sendPaymentResubmittedAdminEmail`) instead of reusing the "New Booking" template.
- Reupload instructions added to the generic status-update email for `REUPLOAD_REQUIRED`, matching the dedicated decline email.
- Admin dashboard cancel-confirm bug fix (the "Cancel this booking?" prompt used to stay visible after switching to a different status button).
- Friendlier default progress-update text for Completed/In Progress instead of a bare "Completed:"/"In Progress:" label.
- Responsive Admin Dashboard layout for mobile (bookings and memberships mobile card layouts).
- Staging CSP/backend-URL fixes for the frontend Content-Security-Policy.

### Other completed items
Walk-in booking mode, `REUPLOAD_SUBMITTED` status + auto status-history logging, admin decline-payment UI, GCash QR at checkout, mobile UX polish across the wizard, phone validation consistency, guest email-exists nudge. Full list in `docs/PENDING.md`'s Completed section.

---

## Booking Status Flow

```
Guest/user submits with payment proof → PENDING_VERIFICATION
Admin approves → CONFIRMED → IN_PROGRESS → COMPLETED
Admin declines → REUPLOAD_REQUIRED (slot stays held) → (customer reuploads via Check Status) → REUPLOAD_SUBMITTED
Admin approves reupload → CONFIRMED
Any state → CANCELLED
Walk-in (admin creates) → CONFIRMED immediately
```

**Status display labels:**
| Status | Label | Color |
|---|---|---|
| PENDING_VERIFICATION | Payment Review | blue |
| REUPLOAD_REQUIRED | Re-upload Required | red |
| REUPLOAD_SUBMITTED | Proof Resubmitted | purple |
| CONFIRMED | Confirmed | blue |
| IN_PROGRESS | In Progress | orange |
| COMPLETED | Completed | green |
| CANCELLED | Cancelled | red |

---

## Recommended Next-Session Order

1. Check `git status` / `git log` for the real current state — this document is a snapshot and goes stale between sessions.
2. If `fix/slot-capacity-and-baliwag-rename` (or whatever the current feature branch is) hasn't been PR'd into `develop` yet, confirm with the user whether it's ready.
3. Work through `docs/NEXT-STEPS.md` for any remaining CI/CD verification items (branch protection, CodeQL baseline triage).
4. Run through `docs/USER-STORIES.md` manually to confirm recent fixes behave correctly end-to-end in the browser.

---

## Where Things Live

```
docs/
  HANDOFF.md               ← this file
  PENDING.md               ← remaining and planned work
  SYSTEM.md                ← full system logic reference (incl. §18 memberships)
  USER-STORIES.md           ← manual QA checklist / user journeys
  CICD.md / CD-BLUEPRINT.md / NEXT-STEPS.md ← CI/CD and CD pipeline docs
  superpowers/
    plans/                  ← historical implementation plans (reference only)
```
