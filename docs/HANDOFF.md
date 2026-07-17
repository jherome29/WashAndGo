# HANDOFF — Wash & Go Auto Salon

Pick-up document for a new Claude session. Read this top to bottom before doing anything else.

---

## What This Project Is

Full-stack booking platform for **Wash & Go Auto Salon (Baliuag Branch)**.

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
- **No git commits** — the user commits manually at all times. Never run `git commit` or `git add`. This is permanent.

---

## Key Reference Documents

| File | What it covers |
|---|---|
| **`docs/SYSTEM.md`** | Complete logic for every feature — read before touching any cross-layer code |
| **`wash-and-go-backend/CLAUDE.md`** | Backend module map, Supabase client, auth guards, email patterns, security checklist |
| **`wash-and-go-SE2/CLAUDE.md`** | Frontend view routing, auth state machine, API layer, Manila timezone |
| **`docs/PENDING.md`** | All remaining and planned work |

---

## Current Git State (as of 2026-07-16)

**Branch:** `post-defense`. Nothing has been committed — all changes are in the working tree.

### Required Supabase changes (verify in dashboard before deploying)
- `password_reset_attempts` table — used by `auth.service.ts` for rate limiting
- `admin_audit_logs` table — used by `AuditLogService`
- `bookings.status` CHECK constraint must include `REUPLOAD_SUBMITTED`
- ✅ **`wash-and-go-backend/supabase/schedule-feature.sql`** has been run in production — `branch_schedules.closed_days` (jsonb) exists and `services.duration_hours` values are corrected.

---

## Everything That Has Been Implemented (Uncommitted)

### Security Hardening ✅
CSP + security headers (`_headers` on Cloudflare Pages, Helmet on NestJS), HSTS header, 10 KB body limit, file upload validation (extension whitelist + MIME type validation, 5 MB max, path traversal guard), error sanitization, DB-backed password reset rate limit (`password_reset_attempts` table), honeypot on booking creation, admin audit log (`AuditLogService` + `admin_audit_logs` table).

npm audit status: frontend 0 vulnerabilities. Backend has 2 non-actionable trees — `js-yaml` (test-tool chain only, not in production) and `multer 2.1.1` (in `@nestjs/platform-express` but no multer-handled routes exist — files go directly to Supabase). Both trees require major-version downgrades to fix; watch for upstream updates.

### Guest Booking Flow (Plan A) ✅
Auth gate removed from frontend wizard — guests can book without an account. Guest status lookup by Booking ID only (no token entry). Rate limit 3/min on `POST /api/bookings`. Guest badge in admin dashboard. Dedicated payment declined email with reupload guide.

### Guest Reupload — Seamless Check Status Flow ✅
When a customer checks their status by Booking ID and sees `REUPLOAD_REQUIRED`, they can re-upload directly in the same session — no email link or token required. The `status === 'REUPLOAD_REQUIRED'` check is the auth gate. All dead token-passing code removed: `plainToken` param from `reuploadProof()`, token rotation in `declinePayment()`, `statusToken` field from `ReuploadProofDto`, `BookingEmailParams`, and all call sites.

### Admin Decline Payment UI (Plan B) ✅
Decline section in admin booking modal: textarea for reason + red "Decline Payment" button. Visible when booking is `PENDING_VERIFICATION` or `REUPLOAD_SUBMITTED`. Dedicated payment declined email with reupload guide sent to customer (instructions: enter Booking ID at website, no token link).

### AuthContext Refactor ✅
`wash-and-go-SE2/context/AuthContext.tsx` — `AuthProvider` + `useAuth()` hook. Auth state (`user`, `token`, `forceRecoveryMode`) consumed via context instead of prop-drilling. Six components updated: `Navbar`, `BookingWizard`, `CheckStatus`, `UserProfile`, `AdminDashboard`, `AuthPage`. `bookings`, `onViewChange`, `services`, and handler callbacks remain as props.

### Additional Features ✅
- **`REUPLOAD_SUBMITTED` status** — set when customer reuploads after a decline. Label: "Proof Resubmitted" (purple). Included in `SLOT_CHECK_STATUSES`.
- **Status history auto-logging** — every key event writes to `booking_updates` via `insertStatusUpdate()`.
- **POST UPDATE flow** — admin status buttons select a pending status; status change + history entry both apply together when "POST UPDATE" is clicked.
- **Styled modals** — booking submission, reupload success, payment decline all use branded modals instead of `alert()`.
- **Dynamic navbar** — "Check Status" for guests, "My Bookings" for logged-in users.
- **Admin date range filter + search** — filter bar in admin bookings tab.
- **Walk-in booking mode** — admin can create bookings that skip payment and auto-confirm.
- **GCash QR code at checkout** — signed URL embedded in payment methods response.
- **VehicleSelection redesign** — card layout with orange pill badges for size and italic Philippine examples.
- **Mobile scroll reduction** — all 5 booking wizard steps have tighter mobile spacing.
- **Phone validation consistency** — `AuthPage`, `UserProfile`, `PaymentForm` all enforce `^09\d{9}$`.
- **Guest email duplicate check** — `PaymentForm` checks if guest email belongs to an existing account; blocking modal if so.
- **`POST /api/auth/check-email`** endpoint — throttled 10/min, email existence check (no email sent).
- **E2E guest-booking test** — Playwright spec fixed: custom calendar picker navigation (Next day arrow), styled modal dismissal ("Got it" button).
- **Reupload E2E test** (`e2e/reupload.spec.ts`) — full guest reupload flow: admin declines → guest resubmits via Check Status by Booking ID → status becomes "Proof Resubmitted".

### Admin Schedule & Availability Management ✅ (2026-07-16)
New Settings tab UI (`ScheduleSettings.tsx`, below the GCash QR card): operating hours, closed weekdays (new `branch_schedules.closed_days` jsonb column), holidays & closures, and custom/half-day hours — all upsert into the existing `schedule_overrides` table. Every mutation is validated server-side (close > open, no closing all 7 weekdays, override end > start) and audit-logged (`UPDATE_SCHEDULE`, `ADD_SCHEDULE_OVERRIDE`, `DELETE_SCHEDULE_OVERRIDE`). New public `GET /api/bookings/schedule-info` feeds the customer calendar (`ScheduleSelection.tsx`), which now greys out closed dates and shows the closure reason. Multi-day services (≥24h duration) skip the same-day "fits before close" check — they only need to start within operating hours. Guest status-token expiry now extends +24h per holiday/closed weekday inside the 48h window (capped at 14 extensions), so tokens don't lapse while the shop is closed.

**Also fixed while implementing this:** `AuditLogService.log()` wrapped its `.insert()` in `void` on a lazy Supabase query builder — the insert never actually ran. Every prior audit-log call site (`CONFIRM_PAYMENT`, `DECLINE_PAYMENT`, `UPDATE_STATUS`, etc.) had silently been a no-op since audit logging was introduced. Now correctly `await`ed inside a try/catch.

**Migration status:** ✅ `wash-and-go-backend/supabase/schedule-feature.sql` has been run against production.

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

1. **Commit everything** — all uncommitted work needs to go into git before deploy.

---

## Where Things Live

```
docs/
  HANDOFF.md               ← this file
  PENDING.md               ← remaining and planned work
  SYSTEM.md                ← full system logic reference
  superpowers/
    plans/
      2026-06-28-pending-booking-cleanup.md ← Plan E — very low priority
```
