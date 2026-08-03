# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Backend Overview

NestJS REST API for Wash & Go Auto Salon. Runs on port 3001 (`/api` prefix). All business logic lives here; the frontend does not write to Supabase directly.

---

## Commands

```bash
npm run start:dev     # watch mode (development)
npm run start:prod    # production (requires built dist/)
npm run build         # compile TypeScript → dist/
npm run lint          # ESLint with auto-fix
npm run format        # Prettier
npm test              # Jest
npm run test:watch    # Jest watch
npm run test:cov      # Jest with coverage
```

---

## Module Map

```
src/
├── main.ts                  Entry point; CORS, validation pipe, global filters
├── app.module.ts            Root module; wires all modules; global throttler (20 req/min/IP)
├── supabase/                Provides anon + admin Supabase clients
├── auth/                    Signup, password reset, email change, Google OAuth, JWT validation
├── bookings/                Core booking CRUD, slot availability, payment workflow, status updates
├── services/                Service package fetch and price editing
├── admin/                   Payment method settings, schedule config, date overrides
├── storage/                 Signed URL generation for file upload/download
├── email/                   Brevo API transactional email; all booking notification templates
├── shop-settings/           Operating hours config (wraps branch_schedules; see note below)
├── memberships/             Club Wash & Go membership program — issue/renew/cancel, vehicle
│                            management, discount computation, visit-count/redemption logic
└── common/
    ├── guards/              AuthGuard, OptionalAuthGuard, AdminGuard
    ├── filters/             GlobalExceptionFilter (Supabase + NestJS error normalization)
    └── health.controller.ts GET /api/health
```

---

## Supabase Client Pattern

`SupabaseService` exposes two clients — always choose the correct one:

```typescript
this.supabase.getClient()       // anon key — RLS enforced — use for auth token validation
this.supabase.getAdminClient()  // service role — RLS bypassed — use for all DB operations
```

All feature services inject `SupabaseService` and use `getAdminClient()` for reads/writes. Never use the anon client for business data — it will be blocked by RLS.

---

## Auth & Authorization Pattern

Guards in `src/common/guards/`:

| Guard | Behavior |
|---|---|
| `AuthGuard` | Requires valid JWT; rejects unauthenticated |
| `OptionalAuthGuard` | Passes `userId` if JWT present; allows null user |
| `AdminGuard` | Requires JWT + `profiles.role === 'admin'` |

Admin check pattern (used in BookingsService for walk-in detection):
```typescript
const { data: profile } = await this.supabase.getAdminClient()
  .from('profiles').select('role').eq('id', userId).single();
const isAdmin = profile?.role === 'admin';
```

Walk-in bookings bypass payment: when `isAdmin` is true at creation time, status is set to `CONFIRMED` directly without requiring `payment_proof_path`.

---

## Booking Creation Details

Key decisions made in `BookingsService.create()`:
0. Rejects if honeypot `website` field is set (bot protection)
1. Validates service exists and is active
2. Re-checks slot availability (race condition guard) + `slotFitsBeforeClose()` check (prevents booking slots the service can't finish before closing)
3. Calculates `totalPrice`: vehicle-size-based for GROOMING/COATING; fuel-type-based for LUBE
3a. Club Wash & Go membership discount: `MembershipsService.computeDiscount(dto.plateNumber, service, totalPrice)` runs immediately after, and may override `totalPrice` — priority `FREE_WASH` > `FIRST_WASH` > `CATEGORY_PERCENT`, only one applies. `FREE_WASH`/`FIRST_WASH` only ever trigger on `service.category === 'GROOMING'` (car wash) — Lube/Ceramic bookings can only get a `CATEGORY_PERCENT` tag. See `src/memberships/memberships.service.ts` and `docs/SYSTEM.md` §18.
4. Calculates `downPaymentAmount` = 30% of total (post-discount)
5. Generates booking ID: `BK-` + 6 random digits
6. Generates status token: 32 random hex bytes (plain text returned once, SHA256 hash stored)
7. Token expiry: 48 hours from creation
8. All customer-provided strings passed through `stripHtml()` before insert
9. Inserts into `bookings` table (including `membership_id` / `membership_discount_type`)
10. Fires confirmation emails (non-blocking via `void`)

### Membership visit-counting hook (`updateStatus()`)

When a booking transitions **into** `COMPLETED` (prior status fetched and compared first — not on every status write), `BookingsService.updateStatus()` awaits `MembershipsService.onBookingCompleted()`. It first checks the booking's `service_id` category: if it's not `GROOMING` (car wash), it only sets `bookings.membership_visit_counted = true` and stops — Lube/Ceramic visits never move the shared counter. For a GROOMING booking, it increments the membership's `visit_count`, grants a `free_wash_credits` credit every 10th visit, redeems/records whichever discount the booking used, and sets `membership_visit_counted = true` as an idempotency guard — status can be set to any value any number of times (no state machine enforcement), so this must not double-count on a repeated `COMPLETED` write.

### Membership issuance requires an existing account

`IssueMembershipDto.userId` is **required** — a membership can only be issued to a customer who already has a Wash & Go account (enforced by both DTO validation and the `memberships.user_id` foreign key). The admin flow is account-first: `GET /api/memberships/customer-search?query=` finds an account by name/phone (via `profiles` — covers every account, including brand-new ones with zero bookings) or email (via `supabase.auth.admin.listUsers()`, since email isn't stored in `profiles`), then `GET /api/memberships/customers/:userId/carwash-history` shows that account's GROOMING-only booking history before issuing. Admin accounts are always excluded from search results (`.eq('role', 'customer')` on the name/phone query; email matches are cross-checked against `profiles.role` and dropped if admin) — membership issuance is a customer-only action.

### Membership expiry cron job

`@nestjs/schedule` is installed and `ScheduleModule.forRoot()` is imported in `app.module.ts` — the only scheduled-job infrastructure in this backend. `MembershipsService.handleDailyMembershipExpiryCheck()` (`@Cron(CronExpression.EVERY_DAY_AT_1AM)`) delegates to `processMembershipExpiries()`, which is a plain method (not itself `@Cron`-decorated) so it can be called directly in tests or for manual verification without waiting on the schedule. It flips lapsed `ACTIVE` memberships to `EXPIRED` and sends the "expiring soon" (within 30 days, once per cycle via the `expiring_reminder_sent_at` timestamp column) and "expired" emails. `renew()` resets `expiring_reminder_sent_at` to `null` so the reminder can fire again next cycle. See `docs/SYSTEM.md` §18 "Expiry Handling."

### Capacity constants (top of `bookings.service.ts`)
```typescript
const CAPACITY = { LUBE: 1, GROOMING: 2, COATING: 2 };
const ACTIVE_STATUSES = ['PENDING', 'PENDING_VERIFICATION', 'REUPLOAD_REQUIRED', 'CONFIRMED', 'IN_PROGRESS'];
const SLOT_CHECK_STATUSES = ['PENDING_VERIFICATION', 'REUPLOAD_SUBMITTED', 'CONFIRMED', 'IN_PROGRESS'];
```
`SLOT_CHECK_STATUSES` are what actually block a slot. `REUPLOAD_SUBMITTED` holds the slot while the resubmitted proof awaits admin review. `PENDING` and `REUPLOAD_REQUIRED` do not consume capacity.

---

## Email Service

`EmailService` (`src/email/email.service.ts`) uses the Brevo REST API (`POST /v3/smtp/email`). All sends are **fire-and-forget** — call with `void`:

```typescript
void this.emailService.sendBookingConfirmation(booking, token);
```

Never `await` email calls. Failures are logged but must not block API responses.

Templates are inline HTML functions returning strings. The brand header uses a dark background + orange accent. When adding a new notification type, follow the existing pattern: build HTML string → call `this.sendEmail({ to, subject, html })`.

Admin notification recipients are read from `process.env.ADMIN_NOTIFICATION_EMAILS` (comma-separated).

`MembershipsService` also injects `EmailService` (imports `EmailModule` in `memberships.module.ts`) for three fire-and-forget membership emails: `sendMembershipIssuedEmail` (from `issue()`), `sendMembershipRenewedEmail` (from `renew()`), and `sendFreeWashEarnedEmail` (from `onBookingCompleted()`, only on the exact visit that crosses a multiple of 10). Recipient email is resolved via `MembershipsService.getUserEmail(userId)`, the same `supabase.auth.admin.getUserById()` pattern `BookingsService` uses.

---

## Rate Limiting

Global: `ThrottlerModule` — 20 requests/minute per IP (in `app.module.ts`).

Per-endpoint overrides via `@Throttle` decorator:
| Endpoint | Limit | Window |
|---|---|---|
| `POST /api/bookings` | 3 req | 60 s |
| `POST /api/bookings/status` | 10 req | 60 s |
| `POST /api/bookings/:id/payment-proof` | 5 req | 5 min |
| `POST /api/auth/check-email` | 10 req | 60 s |
| `POST /api/memberships/lookup` | 10 req | 60 s |
| `GET /api/memberships/vehicle-status` | 20 req | 60 s |

Service-level guards:
- Password reset: 3 attempts/60 s per IP — tracked in `password_reset_attempts` Supabase table (DB-backed, survives restarts and scales across instances)
- Storage upload: 5 attempts/5 minutes (via `@Throttle` on the storage controller)

---

## Input Sanitization

`stripHtml()` is defined at the top of `bookings.service.ts` and applied to all user-provided strings (name, phone, notes, decline reason) before storage. This prevents XSS in email templates. Use it on any new user-facing string fields.

---

## Schedule System

Two related tables exist but only one is used:
- **`branch_schedules`** — one row (`id='default'`), holds `open_time`, `close_time`, `slot_interval_h`. This is the authoritative schedule.
- **`shop_settings`** — fetched by `ShopSettingsModule` but not used in availability logic. Treat as legacy/unused.
- **`schedule_overrides`** — per-date records with `is_closed`, `custom_open`, `custom_close`, `label`.

Availability logic in `BookingsService.getAvailability()`: fetch override for the date → fall back to `branch_schedules` → generate 1-hour slots → filter out slots where `start + service.duration_hours > close_time`.

---

## CORS Configuration

Handled in `main.ts`. Hardcoded allowed origins:
- `localhost:3000–3003`, `localhost:3005`
- `https://wash-and-go-front-back.pages.dev`
- `https://*.wash-and-go-front-back.pages.dev`
- `https://wash-and-go-front-back-*.vercel.app`

Additional origins from `CORS_ORIGINS` env var (comma-separated). Set `CORS_ALLOW_VERCEL=true` to allow all `*.vercel.app` origins (useful for preview deployments).

---

## Validation

Global `ValidationPipe` is configured in `main.ts`:
```typescript
new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
```

All DTOs use `class-validator` decorators. `whitelist: true` strips unknown properties; `forbidNonWhitelisted: true` rejects requests with extra fields. Always add a DTO when adding a new POST/PATCH endpoint.

---

## Storage Buckets

| Bucket | Used For | Access Control |
|---|---|---|
| `payment-proofs` | Customer payment screenshots, progress update images | Admin: any file; Customer: own booking; Guest: token-validated |
| `shop-assets` | Payment method QR code images | Admin only for upload; public for view |

Signed URLs expire in 1 hour. Generation in `StorageService.createSignedUploadUrl()` and `getSignedViewUrl()`.

**File validation in `createSignedUploadUrl()`:**
- Extension whitelist: `['.jpg', '.jpeg', '.png', '.webp']` — throws `400` on violation
- MIME type validation: optional `mimeType` query param cross-checked against extension — throws `400` if MIME is unknown or mismatched with extension
- Max file size: 5 MB (enforced via Supabase bucket policy + backend check)
- Path traversal guard: strips `..` and path separators from filename before use

---

## Security Hardening

### HTTP Headers
- **Backend:** Helmet middleware in `main.ts` — adds `X-Content-Type-Options`, `Referrer-Policy`, `X-XSS-Protection: 0`, and others
- **Frontend:** `_headers` file on Cloudflare Pages — CSP, `Permissions-Policy`, `X-Frame-Options: DENY`

### Request Body Limit
10 KB limit on all JSON payloads via `express.json({ limit: '10kb' })` in `main.ts`. Returns `413` on oversized requests.

### Error Sanitization
`GlobalExceptionFilter` normalizes errors before returning them to clients. Internal error details (stack traces, raw Supabase errors) are never exposed. Only safe, user-facing messages are sent.

### Honeypot
`CreateBookingDto` has an optional `website` field (invisible to real users). If any value is present → `400 BadRequestException` returned immediately, blocking the request before any DB work.

---

## Admin Audit Logging

`AuditLogService` (global NestJS module) records admin mutations to the `admin_audit_logs` Supabase table. All inserts are fire-and-forget — logging failures never fail the API operation.

**Logged operations:**

| Action constant | Triggered by |
|---|---|
| `CONFIRM_PAYMENT` | `confirmPayment()` |
| `DECLINE_PAYMENT` | `declinePayment()` |
| `UPDATE_STATUS` | `updateStatus()` |
| `EDIT_BOOKING` | `adminUpdate()` |
| `ADD_PROGRESS_UPDATE` | `addProgressUpdate()` |
| `UPDATE_PRICE` | `ServicesService.update()` |
| `ISSUE_MEMBERSHIP` / `RENEW_MEMBERSHIP` / `CANCEL_MEMBERSHIP` | `MembershipsService.issue()` / `renew()` / `cancel()` |
| `ADD_MEMBERSHIP_VEHICLE` / `REMOVE_MEMBERSHIP_VEHICLE` | `MembershipsService.addVehicle()` / `removeVehicle()` |
| `ADD_MEMBERSHIP_VISIT` / `REMOVE_MEMBERSHIP_VISIT` | `MembershipsService.incrementVisit()` / `.decrementVisit()` |
| `MEMBERSHIP_VISIT_RECORDED` | `MembershipsService.onBookingCompleted()` |

Inject `AuditLogService` wherever new admin-only mutations are added. Call `void this.auditLog.log({ adminUserId, action, targetId, targetType, details })` after the main operation succeeds.

---

## Security Checklist (run after any backend feature session)

When backend files are modified, verify the following before wrapping up:

- **Rate limiting:** New public endpoints have a `@Throttle` override — the global 20/min is rarely tight enough for unauthenticated routes. Check `bookings.controller.ts` for the existing per-endpoint overrides as a reference.
- **Auth guards:** New admin-only endpoints have both `@UseGuards(SupabaseAuthGuard)` on the controller method AND `requireAdmin()` called inside the service. Both layers are required.
- **Input sanitization:** Any new user-supplied string field stored in the DB passes through `stripHtml()` before insert or update.
- **`SLOT_CHECK_STATUSES`:** If a new booking status is introduced that should hold a time slot, add it to `SLOT_CHECK_STATUSES` at the top of `bookings.service.ts`.
- **`adminUpdate()` whitelist:** If new booking fields are made editable by admins, add them to the `allowed` array in `adminUpdate()` — unknown fields are silently dropped, not rejected, so omitting them creates a silent no-op.
- **Audit log:** New admin-only mutations call `void this.auditLog.log(...)` after the main DB operation succeeds.
