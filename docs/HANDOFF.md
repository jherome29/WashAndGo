# HANDOFF — Wash & Go Auto Salon

Pick-up document for a new Claude session. Read this top to bottom before doing anything else.

---

## What This Project Is

Full-stack booking platform for **Wash & Go Auto Salon (Baliuag Branch)**, now including the **Club Wash & Go** loyalty membership program.

- **Frontend:** React 18 + Vite + TypeScript (port 3000) — `wash-and-go-SE2/`
- **Backend:** NestJS REST API (port 3001, prefix `/api`) — `wash-and-go-backend/`
- **Database / Auth / Storage:** Supabase (project ref: `kgpwahbpjrnwswwevmlt`)
- **Live frontend:** https://wash-and-go-front-back.pages.dev
- **Live backend:** https://wash-and-go-front-back-production.up.railway.app/api
- **Deploy trigger:** push to `main` branch → Cloudflare Pages (frontend) + Railway (backend)

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
| **`docs/USER-STORIES.md`** | Manual QA checklist — user journeys/scenarios for guests, customers, and admins, including regression scenarios for recently-fixed bugs |
| **`wash-and-go-backend/CLAUDE.md`** | Backend module map, Supabase client, auth guards, email patterns, security checklist |
| **`wash-and-go-SE2/CLAUDE.md`** | Frontend view routing, auth state machine, API layer, Manila timezone |
| **`docs/PENDING.md`** | All remaining and planned work |
| **`docs/CICD.md`** / **`docs/CD-BLUEPRINT.md`** / **`docs/NEXT-STEPS.md`** | CI/CD pipeline design and outstanding pipeline setup tasks |

---

## Current Git State

**Repo:** development now happens on `https://github.com/jherome29/WashAndGo` (git remote `washandgo`), **not** the original repo. The original repo (`https://github.com/dreiiiiim/wash-and-go-front-back`, remote `origin`, branch `post-defense`) is left untouched intentionally — do not push, branch from, or otherwise modify it.

**Branch model:** 2 branches — `feature/* → develop → main`. Currently on `develop`. CI (GitHub Actions: lint, tests, security, SonarQube quality gate) gates merges into `develop`; `develop → main` gates production deploys.

**Working tree (uncommitted):** three independent bug fixes are implemented, tested, and independently reviewed, but deliberately **not yet committed** — see "Fixes Pending Commit Decision" below. Ask the user how they want these committed (one combined commit vs. three separate commits) before touching git.

### Required Supabase changes (verify in dashboard before deploying, if not already applied)
- `password_reset_attempts` table — used by `auth.service.ts` for rate limiting
- `admin_audit_logs` table — used by `AuditLogService`
- `bookings.status` CHECK constraint must include `REUPLOAD_SUBMITTED`
- ✅ `wash-and-go-backend/supabase/schedule-feature.sql` — run in production (`branch_schedules.closed_days`, corrected `services.duration_hours`)
- Club Wash & Go membership tables/columns (`memberships`, `membership_vehicles`, `services.membership_discount_pct`, `bookings.membership_id`/`membership_discount_type`/`membership_visit_counted`, `memberships.expiring_reminder_sent_at`) — verify these migrations have been run in production if not already confirmed

---

## Major Features Implemented

### CI/CD Pipeline ✅
GitHub Actions on the new repo: backend (ESLint, Jest+coverage, Nest build), frontend (ESLint, `tsc --noEmit`, Vitest+coverage, Vite build), security (gitleaks + npm audit), SonarQube scan + quality gate, `ci-ok` aggregate check, plus a separate CodeQL (SAST) workflow (security-extended query pack, weekly + on push/PR). 2-branch model (`develop`/`main`); Dependabot removed (was generating ~20 branches) in favor of manual `npm outdated` checks + CI's npm audit step. See `docs/CICD.md`, `docs/CD-BLUEPRINT.md`, `docs/NEXT-STEPS.md` for outstanding pipeline setup items.

### Club Wash & Go Membership Program ✅
Full loyalty membership feature — issued only to existing accounts (account-first "Make a Member" admin flow), up to 3 vehicles per membership, FREE_WASH → FIRST_WASH → CATEGORY_PERCENT discount priority, shared visit counter across vehicles (GROOMING/car-wash visits only), free wash credit every 10th visit, daily expiry cron with reminder/expired emails, full admin audit logging. See `docs/SYSTEM.md` §18 for complete logic and `wash-and-go-backend/CLAUDE.md` / `wash-and-go-SE2/CLAUDE.md` for module-level detail.

### Admin Schedule & Availability Management ✅
Settings tab UI (`ScheduleSettings.tsx`): operating hours, closed weekdays (`branch_schedules.closed_days` jsonb), holidays & closures, custom/half-day hours — all server-side validated and audit-logged. Customer calendar (`ScheduleSelection.tsx`) greys out closed dates with reasons. Multi-day service durations (≥24h) skip the same-day "fits before close" check. Guest status-token expiry auto-extends around closed days. Migration run in production.

### Security Hardening ✅
CSP + security headers, HSTS, 10 KB body limit, file upload validation (extension + MIME + size + path traversal), error sanitization, DB-backed password reset rate limit, honeypot on booking creation, admin audit log.

### Guest Booking Flow ✅
No auth gate — guests book without an account, look up status by Booking ID only, get a "Guest" badge in admin, and receive a dedicated payment-declined email with reupload instructions. Seamless reupload directly from the Check Status page (no token/email link needed).

### Other completed items
Walk-in booking mode, `REUPLOAD_SUBMITTED` status + auto status-history logging, admin decline-payment UI, GCash QR at checkout, mobile UX polish across the wizard, phone validation consistency, guest email-exists nudge. Full list in `docs/PENDING.md`'s Completed section.

---

## Fixes Pending Commit Decision (uncommitted, reviewed, ready)

Three independent correctness/security fixes were implemented via TDD (fresh implementer + independent reviewer per fix), all tests passing, but held uncommitted per the standing "always ask before commit" rule:

1. **Membership number randomization** — `generateMembershipNo()` changed from a sequential DB-count-based `CWG-000001, 000002, ...` scheme (enumerable via the public `POST /api/memberships/lookup` endpoint) to a random 6-digit number, matching the existing booking-ID randomization pattern. `wash-and-go-backend/src/memberships/memberships.service.ts`.
2. **Plate number normalization** — new `normalizePlate()` utility (`wash-and-go-backend/src/memberships/plate.util.ts`) uppercases and strips non-alphanumeric characters, applied at every membership write/read site and mirrored on `VehicleDto`/`CreateBookingDto` via `@Transform` + `@MaxLength(10)`. Fixes silent discount-matching failures when a plate was typed with different case/spacing than how it was registered.
3. **`searchCustomers` pagination cap fix** — admin customer search (used by "Make a Member") only ever read the first 1,000 Supabase Auth accounts (`listUsers({ page: 1, perPage: 1000 })`); any account created after that point was silently unfindable by email search. New `listAllUsers()` helper loops through every page.

All three touch `memberships.service.ts`, so their uncommitted diffs overlap — this is expected and was accounted for during review (each reviewer was told which other uncommitted changes to disregard as already-approved).

**Next step:** ask the user whether to commit these as one combined commit or three separate commits, then commit only with explicit approval.

---

## Booking Status Flow

```
Guest/user submits with payment proof → PENDING_VERIFICATION
Admin approves → CONFIRMED → IN_PROGRESS → COMPLETED
Admin declines → REUPLOAD_REQUIRED → (customer reuploads via Check Status) → REUPLOAD_SUBMITTED
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

1. **Resolve the commit decision** for the three pending fixes above (ask the user: one commit or three).
2. Work through `docs/NEXT-STEPS.md` for remaining CI/CD setup (SonarCloud onboarding, CodeQL baseline triage, branch protection, etc.).
3. Run through `docs/USER-STORIES.md` manually to confirm the membership feature and the three fixes behave correctly end-to-end in the browser.

---

## Where Things Live

```
docs/
  HANDOFF.md               ← this file
  PENDING.md               ← remaining and planned work
  SYSTEM.md                ← full system logic reference (incl. §18 memberships)
  USER-STORIES.md           ← manual QA checklist / user journeys
  CICD.md / CD-BLUEPRINT.md / NEXT-STEPS.md ← CI/CD pipeline docs
  superpowers/
    plans/
      2026-06-28-pending-booking-cleanup.md ← Plan E — very low priority, not implemented
```
