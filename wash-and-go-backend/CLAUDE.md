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
1. Validates service exists and is active
2. Re-checks slot availability (race condition guard)
3. Calculates `totalPrice`: vehicle-size-based for GROOMING/COATING; fuel-type-based for LUBE
4. Calculates `downPaymentAmount` = 30% of total
5. Generates booking ID: `BK-` + 6 random digits
6. Generates status token: 32 random hex bytes (plain text returned once, SHA256 hash stored)
7. Token expiry: 48 hours from creation
8. Inserts into `bookings` table
9. Fires confirmation emails (non-blocking via `void`)

### Capacity constants (top of `bookings.service.ts`)
```typescript
const CAPACITY = { LUBE: 1, GROOMING: 2, COATING: 2 };
const ACTIVE_STATUSES = ['PENDING', 'PENDING_VERIFICATION', 'REUPLOAD_REQUIRED', 'CONFIRMED', 'IN_PROGRESS'];
const SLOT_CHECK_STATUSES = ['PENDING_VERIFICATION', 'CONFIRMED', 'IN_PROGRESS'];
```
`SLOT_CHECK_STATUSES` are what actually block a slot. `PENDING` and `REUPLOAD_REQUIRED` do not consume capacity.

---

## Email Service

`EmailService` (`src/email/email.service.ts`) uses the Brevo REST API (`POST /v3/smtp/email`). All sends are **fire-and-forget** — call with `void`:

```typescript
void this.emailService.sendBookingConfirmation(booking, token);
```

Never `await` email calls. Failures are logged but must not block API responses.

Templates are inline HTML functions returning strings. The brand header uses a dark background + orange accent. When adding a new notification type, follow the existing pattern: build HTML string → call `this.sendEmail({ to, subject, html })`.

Admin notification recipients are read from `process.env.ADMIN_NOTIFICATION_EMAILS` (comma-separated).

---

## Rate Limiting

Global: `ThrottlerModule` — 20 requests/minute per IP (in `app.module.ts`).

Auth endpoints have stricter guards applied manually in services:
- Signup: 5 attempts/min per IP
- Password reset: 3 attempts/min — tracked in an in-memory `Map` in `AuthService` (lost on restart)
- Storage upload: 5 attempts/5 minutes

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

Signed URLs expire in 1 hour. Generation in `StorageService.getSignedUploadUrl()` and `getSignedViewUrl()`.
