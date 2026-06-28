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

## Current Git State (as of 2026-06-29)

**Branch:** `post-defense`. Nothing has been committed — all changes are in the working tree.

### Required Supabase changes (verify in dashboard before deploying)
- `password_reset_attempts` table — used by `auth.service.ts` for rate limiting
- `admin_audit_logs` table — used by `AuditLogService`
- `bookings.status` CHECK constraint must include `REUPLOAD_SUBMITTED`

---

## Everything That Has Been Implemented (Uncommitted)

### Security Hardening ✅
CSP/HSTS/Permissions-Policy headers, Helmet on NestJS, 10 KB body limit, file upload validation (extension whitelist, 5 MB max, path traversal guard), error sanitization, DB-backed password reset rate limit (`password_reset_attempts` table), honeypot on booking creation, status token rotation on reupload, admin audit log (`AuditLogService` + `admin_audit_logs` table).

### Guest Booking Flow (Plan A) ✅
Auth gate removed from frontend wizard — guests can book without an account. Guest status lookup by Booking ID only (no token entry). Status token still generated, stored, and emailed for internal use only. Rate limit 3/min on `POST /api/bookings`. Guest badge in admin dashboard.

### Admin Decline Payment UI (Plan B) ✅
Decline section in admin booking modal: textarea for reason + red "Decline Payment" button. Visible when booking is `PENDING_VERIFICATION` or `REUPLOAD_SUBMITTED`. Dedicated payment declined email with reupload guide sent to customer.

### Additional Features ✅
- **`REUPLOAD_SUBMITTED` status** — set when customer reuploads after a decline. Label: "Proof Resubmitted" (purple). Included in `SLOT_CHECK_STATUSES`.
- **Status history auto-logging** — every key event writes to `booking_updates` via `insertStatusUpdate()`.
- **POST UPDATE flow** — admin status buttons select a pending status; status change + history entry both apply together when "POST UPDATE" is clicked.
- **Guest lookup by Booking ID only** — no token input anywhere in the UI.
- **Styled modals** — booking submission, reupload success, payment decline all use branded modals instead of `alert()`.
- **Dynamic navbar** — "Check Status" for guests, "My Bookings" for logged-in users.
- **Admin date range filter + search** — filter bar in admin bookings tab.
- **Walk-in booking mode** — admin can create bookings that skip payment and auto-confirm.
- **GCash QR code at checkout** — signed URL embedded in payment methods response.

### Session 3 — UX Polish (2026-06-29) ✅
- **VehicleSelection redesign** — card layout shows vehicle type prominently, with orange pill badges for size category and italic Philippine examples.
- **Mobile scroll reduction** — all 5 booking wizard steps (ServiceSelection, VehicleSelection, ScheduleSelection, BookingWizard header/card, PaymentForm) have tighter mobile spacing via responsive `sm:`/`md:` Tailwind classes. Desktop unchanged.
- **ServiceSelection package cards compacted** — reduced padding, spacing, and font size on mobile; price+button section more compact.
- **Phone validation consistency** — `AuthPage` signup and `UserProfile` edit now both enforce `^09\d{9}$` (11 digits, starts with 09) with digit filter on input and inline error. Matches `PaymentForm` behaviour already in place.
- **Guest email duplicate check** — `PaymentForm` now checks if a guest email belongs to an existing account when "COMPLETE BOOKING" is submitted (not on blur). If registered: modal popup blocks submission; submit button disabled until email changes.
- **Email check tip text** — rewritten in plain language for all ages; mentions upcoming loyalty points.
- **All popups mobile-safe** — all modals across `PaymentForm`, `App.tsx`, `BookingWizard`, `CheckStatus` have `max-h-[85vh] overflow-y-auto` and responsive padding (`px-5 sm:px-8`).
- **`check-email` backend endpoint** — `POST /api/auth/check-email` with `@Throttle(10/min)`, `CheckEmailDto`, uses `generateLink(recovery)` as a read-only email existence check (no email sent, no account mutations).
- **`api.checkEmailExists()`** — frontend helper in `lib/api.ts`.

---

## Booking Status Flow

```
Guest/user submits with payment proof → PENDING_VERIFICATION
Admin approves → CONFIRMED → IN_PROGRESS → COMPLETED
Admin declines → REUPLOAD_REQUIRED → (customer reuploads) → REUPLOAD_SUBMITTED
Admin approves reupload → CONFIRMED
Any state → CANCELLED
Walk-in (admin creates) → CONFIRMED immediately
```

**Status display labels:**
| Status | Label | Color |
|---|---|---|
| PENDING_VERIFICATION | Payment Review | yellow |
| REUPLOAD_REQUIRED | Re-upload Required | red |
| REUPLOAD_SUBMITTED | Proof Resubmitted | purple |
| CONFIRMED | Confirmed | green |
| IN_PROGRESS | In Progress | blue |
| COMPLETED | Completed | gray |
| CANCELLED | Cancelled | red |

---

## What Is Still Pending / Planned

See `docs/PENDING.md` for full details. Summary:

| Item | Priority |
|---|---|
| Security item B — file MIME type validation | Medium |
| Security item C — HSTS header in `_headers` | Low (one line) |
| Security item D — `npm audit` both packages | Low |
| Update email templates (remove token references) | Medium |
| Plan C — Reupload E2E test | Medium |
| Plan E — Pending booking bulk-cancel | Very low |
| **Admin Schedule Management** (to plan) | Future |
| **Time Keeping** (to plan) | Future |
| **Customer Loyalty Points** (to plan) | Future |

---

## Recommended Next-Session Order

1. **Security items B, C, D** — small, can do in one pass.
2. **Update email templates** — two small edits in `email.service.ts` removing status token references.
3. **Plan C** — reupload E2E test (1 task, corrected spec in `docs/superpowers/plans/2026-06-27-reupload-e2e.md`).
4. **Plan the new feature set** — Admin Schedule Management, Time Keeping, Loyalty Points (see PENDING.md).
5. **Commit everything** — all uncommitted work needs to go into git before deploy.

---

## Where Things Live

```
docs/
  HANDOFF.md               ← this file
  PENDING.md               ← remaining and planned work
  SYSTEM.md                ← full system logic reference
  superpowers/
    plans/
      2026-06-27-reupload-e2e.md           ← Plan C — corrected, ready to implement
      2026-06-28-pending-booking-cleanup.md ← Plan E — low priority
```
