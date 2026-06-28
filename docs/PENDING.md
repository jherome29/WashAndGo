# Pending Work — Pick Up Here

Everything not yet implemented. Items marked ✅ are done and kept only for reference at the bottom.

---

## Security — Remaining Items

### Item B — File MIME Type Validation on Upload

**File:** `wash-and-go-backend/src/storage/storage.service.ts`

**Problem:** The upload URL endpoint validates extension but not actual MIME type. A renamed file can bypass the check.

**Fix:** After the extension check in `createSignedUploadUrl()`, add:
```typescript
const mimeMap: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg',
  png: 'image/png', webp: 'image/webp',
  heic: 'image/heic', heif: 'image/heif',
};
const mimeType = mimeMap[ext ?? ''];
if (!mimeType) throw new BadRequestException('Only image files are allowed.');
```

---

### Item C — HSTS Header

**File:** `wash-and-go-SE2/public/_headers`

**Fix:** Add to the `/*` block:
```
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

---

### Item D — npm audit

```bash
cd wash-and-go-backend && npm audit --audit-level=high
cd wash-and-go-SE2 && npm audit --audit-level=high
```
Run `npm audit fix` for auto-fixable issues. Apply major bumps manually.

---

## Email Templates Needing Update

**File:** `wash-and-go-backend/src/email/email.service.ts`

Two templates still reference the status token as required for guest lookup. Guests now look up by Booking ID only — the token is never entered anywhere.

1. **`sendBookingCreatedCustomerEmail`** — remove the "here is your status token" section. Replace with: "Keep your Booking ID — you can check your appointment status anytime on our website."
2. **`sendPaymentDeclinedEmail`** — remove the "paste your token" step. Replace with: "Go to our website and enter your Booking ID to re-upload your proof."

---

## Plan C — Reupload E2E Test

**File:** `docs/superpowers/plans/2026-06-27-reupload-e2e.md`

One task. Self-contained Playwright test for the full reupload flow. Spec has been updated to reflect current system state:
- Guest lookup: Booking ID input only (no token field)
- Expected final status after reupload: "Proof Resubmitted" (`REUPLOAD_SUBMITTED`)
- Nav button for guests: "CHECK STATUS" (not "MY BOOKINGS")

---

## Plan E — Pending Booking Bulk-Cancel

**File:** `docs/superpowers/plans/2026-06-28-pending-booking-cleanup.md`

**Very low priority.** Admin-triggered bulk-cancel of stale `PENDING` bookings. New bookings can no longer reach `PENDING` status (all go to `PENDING_VERIFICATION` or `CONFIRMED`), so only old legacy records would be affected. Verify in Supabase first — if no stale records exist, skip entirely.

---

## Future Feature Set (To Plan)

These three features are on the roadmap but have no spec or plan yet. They should be brainstormed and planned together since they are related.

### Admin Schedule Management

The current system has basic schedule management:
- `branch_schedules` (single row) — shop open/close time and slot interval
- `schedule_overrides` — per-date closures and custom hours

**Possible scope:**
- Better admin UI for setting recurring patterns (e.g., always closed Sundays)
- Staff assignment per slot — which technician handles which booking
- Booking capacity adjustments per date or slot
- Visual calendar view in admin dashboard

**Key constraint:** Any changes must stay compatible with `BookingsService.getAvailability()` which drives slot generation.

---

### Time Keeping

Currently the system tracks booking status (e.g., `IN_PROGRESS`, `COMPLETED`) but not actual timestamps for when work started and ended.

**Possible scope:**
- Record actual start time when status changes to `IN_PROGRESS`
- Record actual end time when status changes to `COMPLETED`
- Compare actual vs. estimated duration (the `durationHours` field on services)
- Reports for admin: average turnaround by service type, busiest times of day
- Employee clock-in/clock-out (if staff management is added)

**Key table to consider:** `booking_updates` already captures timestamped entries per booking — the start/end time could be added as structured fields on the `bookings` table rather than free-text update notes.

---

### Customer Loyalty Points

The UI already has a teaser: *"Coming soon: earn loyalty points every time you book!"* shown in `PaymentForm.tsx` guest email tip and potentially elsewhere.

**Possible scope:**
- Points earned per completed booking (e.g., 1 point per ₱100 of total price)
- Points balance shown in `UserProfile` and possibly on the home/status pages
- Point redemption flow — apply points as a discount at checkout
- Points history — list of transactions (earned, redeemed)
- Admin ability to manually adjust points (compensation for issues)

**Key DB work needed:**
- New `loyalty_points` table: `user_id`, `booking_id`, `points`, `type` (earned/redeemed/adjusted), `created_at`
- OR add `points_balance` column to `profiles` (simpler, but less auditable)
- Award points in `BookingsService` when status changes to `COMPLETED`
- Apply redemption as a discount field on `CreateBookingDto`

**Note:** Points only make sense for authenticated users (not guests). Guest bookings would not earn points, which is another nudge to create an account.

---

## Completed ✅

- Security hardening (CSP, body limits, Permissions-Policy, file size enforcement, error sanitization, auth rate limiting, honeypot, token rotation, `_headers`)
- DB-backed password reset rate limiting
- Admin audit log (`AuditLogService` + `admin_audit_logs` table)
- Code quality tools (ESLint, Jest, Vitest, Playwright E2E)
- Item A — Rate limit 3/min on `POST /api/bookings`
- Item E — Admin session expiry: 401 in `api.ts` calls `supabase.auth.signOut()` + reload
- Plan A — Guest Booking Flow (auth gate removed, Booking ID-only lookup, guest badge, decline email, etc.)
- Plan B — Admin Decline Payment UI
- `REUPLOAD_SUBMITTED` status + status history auto-logging + POST UPDATE flow
- Walk-in booking mode (admin-created bookings skip payment, auto-confirm)
- GCash QR code at checkout
- Styled booking/reupload/decline modals replacing `alert()`
- Dynamic navbar (Check Status / My Bookings)
- Admin date range filter + search
- VehicleSelection redesign (orange badges, Philippine examples)
- Mobile scroll reduction across all 5 wizard steps
- ServiceSelection package cards compacted on mobile
- Phone number validation consistency (AuthPage, UserProfile, PaymentForm all enforce `^09\d{9}$`)
- Guest email duplicate check on submit (`POST /api/auth/check-email` endpoint, blocking modal in PaymentForm)
- Account tip text rewritten (plain language, loyalty points teaser)
- All popups mobile-safe (`max-h-[85vh]`, responsive padding)
