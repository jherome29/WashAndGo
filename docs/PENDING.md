# Pending Work — Pick Up Here

Everything not yet implemented. Items marked ✅ are done and kept only for reference at the bottom.

---

## Completed ✅

- **Admin Schedule & Availability Management** (2026-07-16) — Settings tab UI (`ScheduleSettings.tsx`) for operating hours, closed weekdays (`branch_schedules.closed_days` jsonb), holidays & closures, and custom/half-day hours, all with server-side validation and audit logging (`UPDATE_SCHEDULE`, `ADD_SCHEDULE_OVERRIDE`, `DELETE_SCHEDULE_OVERRIDE`). Customer calendar (`ScheduleSelection.tsx`) greys out closed dates with reasons via new public `GET /api/bookings/schedule-info`. Multi-day service durations (≥24h) correctly skip the same-day "fits before close" check. Guest status-token expiry auto-extends +24h per holiday/closed day so tokens don't lapse while the shop is closed. Migration (`wash-and-go-backend/supabase/schedule-feature.sql`) has been run in production — feature is fully live.
- **Fixed `AuditLogService`** — the `.insert()` call was wrapped in `void` on a lazy Supabase query builder, so it never actually executed; every past audit-log call (`CONFIRM_PAYMENT`, `DECLINE_PAYMENT`, `UPDATE_STATUS`, etc.) had silently been a no-op. Now `await`ed inside try/catch — audit logs persist correctly going forward.
- Reupload E2E test (`e2e/reupload.spec.ts`) — full guest reupload flow: admin declines payment, guest resubmits proof via Check Status by Booking ID, status becomes "Proof Resubmitted" (`REUPLOAD_SUBMITTED`).
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
