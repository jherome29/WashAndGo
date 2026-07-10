# Pending Work — Pick Up Here

Everything not yet implemented. Items marked ✅ are done and kept only for reference at the bottom.

---

## Plan C — Reupload E2E Test

**File:** `docs/superpowers/plans/2026-06-27-reupload-e2e.md`

One task. Self-contained Playwright test for the full reupload flow. Spec reflects current system state:
- Guest lookup: Booking ID input only (no token field)
- Expected final status after reupload: "Proof Resubmitted" (`REUPLOAD_SUBMITTED`)
- Nav button for guests: "CHECK STATUS" (not "MY BOOKINGS")
- Re-upload works directly from Check Status page — no email link or token needed

---

## Plan E — Pending Booking Bulk-Cancel

**File:** `docs/superpowers/plans/2026-06-28-pending-booking-cleanup.md`

**Very low priority.** Admin-triggered bulk-cancel of stale `PENDING` bookings. New bookings can no longer reach `PENDING` status (all go to `PENDING_VERIFICATION` or `CONFIRMED`), so only old legacy records would be affected. Verify in Supabase first — if no stale records exist, skip entirely.

---

## Future Feature Set (To Plan)

These three features are on the roadmap but have no spec or plan yet. Use the brainstorming skill before implementing any of them.

### Customer Loyalty Points

The UI already has a teaser: *"Coming soon: earn loyalty points every time you book!"* shown in `PaymentForm.tsx`.

**AuthContext refactor is a prerequisite** — done ✅. Any loyalty UI can now call `useAuth()` from wherever it lives.

**Possible scope:**
- Points earned per completed booking (e.g., 1 point per ₱100 of total price)
- Points balance shown in `UserProfile`
- Point redemption flow — apply points as a discount at checkout
- Points history — list of transactions (earned, redeemed)
- Admin ability to manually adjust points

**Key DB work needed:**
- New `loyalty_points` table: `user_id`, `booking_id`, `points`, `type` (earned/redeemed/adjusted), `created_at`
- OR add `points_balance` column to `profiles` (simpler, but less auditable)
- Award points in `BookingsService` when status changes to `COMPLETED`
- Points only for authenticated users — guest bookings do not earn points

---

### Admin Schedule Management

The current system has basic schedule management:
- `branch_schedules` (single row) — shop open/close time and slot interval
- `schedule_overrides` — per-date closures and custom hours

**Possible scope:**
- Better admin UI for setting recurring patterns (e.g., always closed Sundays)
- Booking capacity adjustments per date or slot
- Visual calendar view in admin dashboard

**Key constraint:** Changes must stay compatible with `BookingsService.getAvailability()`.

---

### Time Keeping

Currently tracks booking status but not actual work timestamps.

**Possible scope:**
- Record actual start/end time when status changes to `IN_PROGRESS` / `COMPLETED`
- Compare actual vs. estimated duration (`durationHours` on services)
- Reports for admin: average turnaround by service type, busiest times of day

---

## Completed ✅

- Security hardening: CSP, HSTS, Permissions-Policy, Helmet, 10 KB body limit, file upload validation (extension + MIME type), 5 MB max, path traversal guard, error sanitization
- DB-backed password reset rate limiting (`password_reset_attempts` table)
- Admin audit log (`AuditLogService` + `admin_audit_logs` table)
- Item A — Rate limit 3/min on `POST /api/bookings`
- Item B — MIME type validation on `POST /storage/upload-url` (validates `mimeType` param against allowlist + cross-checks extension)
- Item C — HSTS header in `wash-and-go-SE2/public/_headers`
- Item D — npm audit: frontend 0 vulns; backend 2 non-actionable trees (js-yaml in test chain only, multer in platform-express with no multer routes)
- Item E — Admin session expiry: 401 in `api.ts` calls `supabase.auth.signOut()` + reload
- Plan A — Guest Booking Flow (auth gate removed, Booking ID-only lookup, guest badge, decline email, rate limit)
- Plan B — Admin Decline Payment UI (decline button + reason textarea in admin modal)
- Guest reupload seamless flow — `REUPLOAD_REQUIRED` bookings can be re-uploaded via Check Status by Booking ID, no token required; dead token-passing chain removed
- AuthContext refactor — `wash-and-go-SE2/context/AuthContext.tsx`; 6 components updated
- E2E guest-booking test — fixed calendar navigation + modal dismissal selectors
- Email template cleanup — `statusToken` removed from `BookingEmailParams` type and all call sites
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
- Code quality tools: ESLint, Jest (backend), Vitest (frontend), Playwright E2E
