# System Behavior Reference

This document explains exactly how the Wash & Go booking system works — business logic, data flow, edge cases, and how every major feature behaves at runtime. Read this when making changes that touch multiple layers of the stack.

---

## Table of Contents

1. [Booking Statuses](#1-booking-statuses)
2. [Booking Creation — Customer Path](#2-booking-creation--customer-path)
3. [Booking Creation — Walk-In (Admin) Path](#3-booking-creation--walk-in-admin-path)
4. [Slot Availability Calculation](#4-slot-availability-calculation)
5. [Pricing Calculation](#5-pricing-calculation)
6. [Payment Proof Workflow](#6-payment-proof-workflow)
7. [Guest Status Token System](#7-guest-status-token-system)
8. [Admin Booking Operations](#8-admin-booking-operations)
9. [Email Notification System](#9-email-notification-system)
10. [Authentication System](#10-authentication-system)
11. [File Upload & Storage](#11-file-upload--storage)
12. [Schedule & Overrides System](#12-schedule--overrides-system)
13. [Payment Methods Management](#13-payment-methods-management)
14. [Service Package Management](#14-service-package-management)
15. [Frontend Auth State Machine](#15-frontend-auth-state-machine)
16. [Security Hardening](#16-security-hardening)
17. [Admin Audit Logging](#17-admin-audit-logging)
18. [Club Wash & Go Membership Program](#18-club-wash--go-membership-program)

---

## 1. Booking Statuses

Every booking has a `status` field. These are the only valid values (enforced by DB CHECK constraint):

| Status | Meaning | Who can set it |
|---|---|---|
| `PENDING` | Submitted without a payment proof | System (auto on create) |
| `PENDING_VERIFICATION` | Payment proof submitted; awaiting admin review | System (auto on create / reupload) |
| `CONFIRMED` | Admin verified payment OR walk-in booking created by admin | Admin via confirmPayment / auto on walk-in create |
| `IN_PROGRESS` | Vehicle is actively being serviced | Admin via updateStatus |
| `COMPLETED` | Service finished | Admin via updateStatus |
| `CANCELLED` | Booking cancelled | Admin via updateStatus |
| `REUPLOAD_REQUIRED` | Admin declined payment proof; customer must reupload | Admin via declinePayment |
| `REUPLOAD_SUBMITTED` | Customer submitted new proof after a decline; awaiting re-review | System (auto on reupload) |

**Which statuses block a slot (consume capacity):**
```
SLOT_CHECK_STATUSES = ['PENDING_VERIFICATION', 'REUPLOAD_SUBMITTED', 'CONFIRMED', 'IN_PROGRESS']
```
`PENDING` and `REUPLOAD_REQUIRED` do NOT block a slot. `REUPLOAD_SUBMITTED` does — the customer has submitted proof and is awaiting re-review, so the slot is effectively held.

**Which statuses count as "active" for display purposes:**
```
ACTIVE_STATUSES = ['PENDING', 'PENDING_VERIFICATION', 'REUPLOAD_REQUIRED', 'CONFIRMED', 'IN_PROGRESS']
```

---

## 2. Booking Creation — Customer Path

**Endpoint:** `POST /api/bookings`  
**Auth:** Optional (OptionalAuthGuard). Works for guests and logged-in customers.

### Step-by-step logic in `BookingsService.create()`

**Step 0 — Honeypot check**
- DTO includes a `website` honeypot field (hidden from real users; bots fill it automatically)
- If `dto.website` has any value → `400 BadRequestException` (silently blocks automated submissions)

**Step 1 — Validate service**
- Queries `services` table: `id = dto.serviceId AND is_active = true`
- If not found → `404 NotFoundException`
- If service category is `LUBE` but `fuelType` missing → `400 BadRequestException`
- If service category is NOT `LUBE` but `fuelType` provided → `400 BadRequestException`

**Step 2 — Check slot availability (race condition guard)**
- Calls `isSlotAvailable(dto.date, dto.timeSlot, service.category)`
- Counts existing bookings matching: same date + same time slot + same service category + status in `SLOT_CHECK_STATUSES`
- If count ≥ `CAPACITY[category]` → `409 ConflictException`
- Also validates `slotFitsBeforeClose(timeSlot, service.duration_hours, closeTime)` — prevents booking slots where the service can't complete before closing time, even when submitting via direct API

Capacity values: `{ LUBE: 1, GROOMING: 2, COATING: 2 }`

**Step 3 — Calculate pricing**
- LUBE with `is_lube_flat = true`: uses `service.lube_prices[dto.fuelType]`
- LUBE with `is_lube_flat = true` but no fuel type match: falls back to `service.price_small`
- All other services: uses `service[price_${dto.vehicleSize.toLowerCase()}]`
  - Maps `SMALL` → `price_small`, `MEDIUM` → `price_medium`, `LARGE` → `price_large`, `EXTRA_LARGE` → `price_extra_large`
- `downPaymentAmount = Math.round(totalPrice × 0.3)` (30%, rounded to nearest peso)

**Step 4 — Generate IDs and token**
- Booking ID: `BK-` + 6-digit random number (100000–999999), e.g. `BK-483920`
- Status token: `randomBytes(32).toString('hex')` → 64-character hex string
- Token hash: `SHA256(plainToken)` stored in DB
- Token expiry: `new Date(Date.now() + 48 * 60 * 60 * 1000)` — 48 hours from creation

**Step 5 — Resolve customer email**
- If `dto.customerEmail` provided → use it
- Else if `userId` provided → fetch from `auth.admin.getUserById(userId).user.email`
- Otherwise → null (no email notifications sent)

**Step 6 — Determine initial status**
- Admin creating (see §3): `CONFIRMED`
- Customer provides `dto.paymentProofPath`: `PENDING_VERIFICATION`
- No payment proof: `PENDING`

**Step 7 — Insert into `bookings` table**

All string fields from the customer are passed through `stripHtml()` (strips `<[^>]*>` tags) before storage. Fields inserted:

```
id, user_id, customer_name (stripped), customer_phone, customer_email,
service_id, service_name (from DB, not client), vehicle_size, vehicle_type,
fuel_type, oil_type, date, time_slot, plate_number, total_price,
down_payment_amount, status, payment_proof_path, payment_method,
status_token_hash, status_token_expires_at
```

**Step 8 — Send emails (non-blocking)**
- Calls `void this.notifyBookingCreated(...)` — fire-and-forget
- If customer email exists: sends "Booking Received" email to customer
- Always sends "New Booking" email to all admin notification addresses (if configured)

**Step 9 — Return**
Returns the booking object plus `statusToken` (plain text, shown once to customer). The DB only stores the hash.

---

## 3. Booking Creation — Walk-In (Admin) Path

Walk-in mode uses the same `POST /api/bookings` endpoint but is detected server-side.

**Detection:** `isAdminBooking = userId ? await this.isAdmin(userId) : false`
- Checks `profiles.role === 'admin'` for the JWT userId

**Differences from normal booking:**
- Status is immediately `CONFIRMED` regardless of `paymentProofPath`
- `paymentProofPath` is typically null (admin enters booking without proof)
- Customer phone/email are optional (walk-in customers may only give name)
- All other validations still apply (service must exist, slot must be available)

**UI trigger:** Admin dashboard has a "Walk-In Booking" button that opens the same form the admin fills out on behalf of the customer.

---

## 4. Slot Availability Calculation

**Endpoint:** `GET /api/bookings/availability?date=YYYY-MM-DD&serviceId=<id>`

**Full flow in `BookingsService.getAvailability()`:**

1. If `serviceId` provided → fetch `category` and `duration_hours` from `services` table
2. Fetch default schedule from `branch_schedules` (single row, `id='default'`)
   - Contains `open_time` (e.g. `08:00`), `close_time` (e.g. `17:00`), `slot_interval_h` (e.g. `1`)
3. Fetch schedule override for the date from `schedule_overrides`
   - If `override.is_closed = true` → return `{ date, slots: [], closed: true }` immediately
4. Resolve open/close time:
   - Use `override.custom_open` if present, else `schedule.open_time`, else `'08:00'`
   - Use `override.custom_close` if present, else `schedule.close_time`, else `'17:00'`
5. Generate slots with `generateSlots(openTime, closeTime, intervalH)`:
   - Converts open/close to total minutes
   - Loops from `openMins` to `closeMins` in steps of `intervalH × 60`
   - Formats each as `"HH:MM AM/PM"` (12-hour format, zero-padded)
   - Example: `08:00–17:00, 1h` → `['08:00 AM', '09:00 AM', '10:00 AM', ..., '04:00 PM']`
6. Fetch booked slots for the date+category (counts by status in `SLOT_CHECK_STATUSES`)
7. For each generated slot, mark as available/unavailable:
   - Unavailable if: slot is in booked slots set (at capacity)
   - Unavailable if: `slotFitsBeforeClose` returns false
     - `slotFitsBeforeClose`: converts slot time to minutes, checks `slotMins + durationHours×60 ≤ closeMins`
     - Example: 2-hour service, slot `04:00 PM` (960 min), close `05:00 PM` (1020 min) → 960+120=1080 > 1020 → unavailable

**Returned structure:**
```json
{
  "date": "2026-06-27",
  "closed": false,
  "slots": [
    { "time": "08:00 AM", "available": true },
    { "time": "09:00 AM", "available": false },
    ...
  ]
}
```

**Frontend uses:** The `ScheduleSelection` component calls `api.getAvailability(date, selectedService.id)`, then additionally calls `api.getBookedSlots(date, selectedService.category)` for the capacity bar display, and renders only available slots as selectable.

---

## 5. Pricing Calculation

Pricing happens in two places — both must stay in sync:

### Backend (authoritative, in `BookingsService.create()`)

```typescript
if (service.is_lube_flat && service.lube_prices && dto.fuelType) {
  totalPrice = service.lube_prices[dto.fuelType];     // e.g. lube_prices['GAS'] = 1400
} else if (service.is_lube_flat) {
  totalPrice = service.price_small;                    // fallback
} else {
  const sizeKey = `price_${dto.vehicleSize.toLowerCase()}`;  // 'price_medium'
  totalPrice = service[sizeKey];
}
downPaymentAmount = Math.round(totalPrice * 0.3);
```

**Membership discount step:** immediately after `totalPrice` is calculated and before the down payment is computed, `BookingsService.create()` calls `MembershipsService.computeDiscount(dto.plateNumber, service, totalPrice)`, which may override `totalPrice` per the FREE_WASH → FIRST_WASH → CATEGORY_PERCENT priority rule (see §18). The down payment is always 30% of the post-discount price.

### Frontend (display only, in `BookingWizard.tsx`)

Reads `selectedService.isLubeFlat`:
- True → show `selectedService.lubePrices[selectedFuelType]` for the price
- False → show `selectedService.prices[selectedVehicleSize]` where `prices` is an object with keys `SMALL/MEDIUM/LARGE/EXTRA_LARGE`

The frontend also reads live prices from `api.getServices()` on mount. `constants.ts` contains hardcoded fallback definitions — if the API fetch fails, the frontend shows these values (which may be stale).

### Vehicle size key mapping
| Frontend enum | DB column |
|---|---|
| `SMALL` | `price_small` |
| `MEDIUM` | `price_medium` |
| `LARGE` | `price_large` |
| `EXTRA_LARGE` | `price_extra_large` |

---

## 6. Payment Proof Workflow

### 6a. Customer Uploads Proof (during booking)

1. Customer calls `GET /api/storage/upload-url?fileName=screenshot.png` (with auth JWT or guest token)
2. Backend returns `{ signedUrl, path }` where path is `proofs/[timestamp]-[filename]`
3. Frontend does `fetch(signedUrl, { method: 'PUT', body: file })` directly to Supabase Storage
4. `path` is stored as `dto.paymentProofPath` in booking creation request
5. Booking enters `PENDING_VERIFICATION`

### 6b. Admin Reviews Payment

Admin opens booking in dashboard → sees "Manage" modal → views proof image:
1. Frontend calls `GET /api/storage/view-url?path=proofs/...&bookingId=BK-xxx` (with admin JWT)
2. Backend verifies admin role → generates 1-hour signed view URL from `payment-proofs` bucket
3. Frontend displays image inline

**Admin confirms payment:**
- `POST /api/bookings/:id/payment/confirm` (admin JWT required)
- Guard: booking must be in `PENDING_VERIFICATION` (throws `400` otherwise)
- Updates: `status → CONFIRMED`, `payment_reviewed_at → now()`, `payment_reviewed_by → adminUserId`
- Triggers: "Booking Update" email to customer with `CONFIRMED` status message

**Admin declines payment:**
- `POST /api/bookings/:id/payment/decline` with `{ declineReason: "..." }`
- Guard: booking must be in `PENDING_VERIFICATION` or `REUPLOAD_SUBMITTED`
- Sanitizes reason: `stripHtml(declineReason)`
- Updates: `status → REUPLOAD_REQUIRED`, `payment_decline_reason → sanitizedReason`, `payment_reviewed_at`, `payment_reviewed_by`
- Triggers: dedicated `sendPaymentDeclinedEmail` to customer — includes decline reason block and instructions to visit website and enter Booking ID to re-upload (no token link)

### 6c. Customer Reuploads Proof

Customer sees a re-upload UI directly in the Check Status page when they look up their booking by Booking ID and status is `REUPLOAD_REQUIRED`. No email link or token required.

1. Customer calls `POST /api/storage/upload-url?fileName=...&mimeType=image/jpeg` (no auth, no bookingId, no token needed — falls through to the anonymous path)
2. Returns signed upload URL
3. Customer uploads file directly to Supabase Storage
4. Customer calls `POST /api/bookings/:id/payment-proof` with `{ paymentProofPath }` (no token in body)

**Server-side auth on reupload (`reuploadProof()`):**
- Gate: booking `status` must be `REUPLOAD_REQUIRED` (checked before anything else) — this is the only auth gate
- No token validation, no user ownership check — the status check is sufficient
- Rate limited to 5 requests / 5 minutes per IP

Updates: `status → REUPLOAD_SUBMITTED`, `payment_proof_path → new path`, `payment_decline_reason → null`
Triggers: admin notification email so admins know to review again

---

## 7. Guest Status Token System

A status token is generated on booking creation and stored as a hash in the DB. The token is returned once in the booking creation response (shown in the confirmation modal).

### How it works

- On booking creation, backend generates: `plainToken = randomBytes(32).toString('hex')`
- `tokenHash = SHA256(plainToken)` stored in `bookings.status_token_hash`
- `tokenExpiry = now + 48 hours` stored in `bookings.status_token_expires_at`
- Response includes `statusToken: plainToken` — shown once in the confirmation modal

### What the token currently enables

The token infrastructure is in the DB but the **reupload flow no longer requires it**. Customers re-upload directly from the Check Status page using their Booking ID — no token needed.

The token **is** still validated by `StorageService.validateGuestToken()` when a request provides both `bookingId` AND `statusToken` as query params to `POST /api/storage/upload-url`. This path is no longer used by the frontend but remains in the backend for backwards compatibility.

### Guest status lookup

Guests look up their booking status at `POST /api/bookings/status` with `{ id: "BK-xxx" }` — no token required. The endpoint is public (OptionalAuthGuard) and rate limited to 10 req / 60 s.

### Reupload without token

When a booking is `REUPLOAD_REQUIRED`, anyone who knows the Booking ID can submit a new proof via `POST /api/bookings/:id/payment-proof`. The status check is the auth gate. See §6c.

---

## 8. Admin Booking Operations

All admin operations require `profiles.role === 'admin'` verified server-side via `requireAdmin(userId)`.

### Update Booking Status
`PATCH /api/bookings/:id/status` with `{ status: "IN_PROGRESS" }`

- Allowed for any status transition (no state machine enforcement — admin can set any valid status)
- Triggers status update email to customer (if email on file)

### Edit Booking Fields
`PATCH /api/bookings/:id` with any of: `{ date, time_slot, plate_number, customer_name, customer_phone, customer_email, notes }`

- Backend whitelist (`adminUpdate` method): only the above 7 fields are permitted; others are silently dropped
- All string values pass through `stripHtml()`
- Does NOT re-check slot availability when changing date/time — admin is trusted to manage conflicts

### Add Progress Update
`POST /api/bookings/:id/updates` with `{ message: string, imageUrls: string[] }`

- Inserts a row into `booking_updates` table: `{ booking_id, message (stripped), image_urls, created_at }`
- Triggers "Progress Update" email to customer with message text + up to 4 images shown inline in email
- `booking_updates` rows are returned in all booking fetches (joined via `booking_updates(*)`)
- Updates are sorted by `created_at` ascending (chronological, oldest first) in `toBooking()` mapper

### Confirm/Decline Payment — See §6b

### View All Bookings
`GET /api/bookings` with optional `?status=CONFIRMED&date=2026-06-27`

- Admin-only endpoint
- Returns all bookings (newest first) with their `booking_updates` joined
- Filter by status: exact match, or `ALL` / omit to get everything
- Filter by date: exact match on `date` column (format `YYYY-MM-DD`)

---

## 9. Email Notification System

All email uses **Brevo REST API** (`POST https://api.brevo.com/v3/smtp/email`). Configured via env vars.

**Critical pattern:** All email sends called from `BookingsService` are fire-and-forget:
```typescript
void this.notifyBookingCreated(booking, customerName, email, isPending);
```
The `void` means failures never propagate to the API response. Errors are logged as warnings.

However, emails sent from `AuthService` (verification, password reset, email change) are **awaited** and failures DO fail the request. If `BREVO_API_KEY` is missing, auth operations throw `500`.

### Email Types & Triggers

**Account emails (blocking):**

| Email | Method | Subject | Trigger |
|---|---|---|---|
| Email verification | `sendVerificationEmail` | "Confirm your Wash & Go account" | `POST /api/auth/signup` |
| Password reset | `sendPasswordResetEmail` | "Reset your Wash & Go password" | `POST /api/auth/request-password-reset` |
| Email change | `sendEmailChangeVerificationEmail` | "Confirm your new email — Wash & Go" | `PATCH /api/auth/request-email-change` |

**Booking emails (non-blocking, fire-and-forget):**

| Email | Method | Recipients | Trigger |
|---|---|---|---|
| Booking received (customer) | `sendBookingCreatedCustomerEmail` | `booking.customer_email` | `POST /api/bookings` (if email exists) |
| New booking (admin) | `sendBookingCreatedAdminEmail` | `ADMIN_NOTIFICATION_EMAILS` | `POST /api/bookings` (always, if env set) |
| Status update | `sendBookingStatusEmail` | `booking.customer_email` | `PATCH /api/bookings/:id/status`, confirm payment |
| Payment declined | `sendPaymentDeclinedEmail` (dedicated method) | `booking.customer_email` | `POST /api/bookings/:id/payment/decline` |
| Re-review needed (admin) | `sendBookingCreatedAdminEmail` (same method) | `ADMIN_NOTIFICATION_EMAILS` | `POST /api/bookings/:id/payment-proof` (reupload) |
| Progress update | `sendProgressUpdateEmail` | `booking.customer_email` | `POST /api/bookings/:id/updates` |

**Membership emails (non-blocking, fire-and-forget):**

| Email | Method | Recipients | Trigger |
|---|---|---|---|
| Membership issued | `sendMembershipIssuedEmail` | member's account email | `POST /api/memberships` (after successful issuance) |
| Membership renewed | `sendMembershipRenewedEmail` | member's account email | `POST /api/memberships/:id/renew` |
| Free wash earned | `sendFreeWashEarnedEmail` | member's account email | `PATCH /api/bookings/:id/status` → `COMPLETED`, only on the exact visit that crosses a multiple of 10 |
| Membership expiring soon | `sendMembershipExpiringSoonEmail` | member's account email | Daily cron (`processMembershipExpiries()`), once per expiry cycle — see §18 |
| Membership expired | `sendMembershipExpiredEmail` | member's account email | Daily cron (`processMembershipExpiries()`), when `expires_at` has passed — see §18 |

All five resolve the recipient via `MembershipsService.getUserEmail(membership.user_id)` (same `supabase.auth.admin.getUserById()` pattern as bookings) — since a membership always has a `user_id` now, this always has something to resolve.

### Resolving Customer Email

Many booking records are created without a stored `customer_email` (if the customer didn't enter one). The backend resolves email for notifications:
```typescript
const email = customerEmail || (userId ? await this.getUserEmail(userId) : null);
```
`getUserEmail(userId)` calls `supabase.auth.admin.getUserById(userId)` to get the email from Supabase Auth — this covers logged-in customers who didn't fill in the email field on the form.

### Email Template Structure

All templates use the same `wrapper()` function which adds:
- Dark header (`#1a1a1a` background, white "WASH & GO" text, orange `&` symbol)
- White body section
- Dark footer with copyright

All user-provided values passed into templates are HTML-escaped via `escapeHtml()` before injection.

The `statusBadge(status)` helper renders colored pill badges in emails (yellow for PENDING, blue for CONFIRMED, green for COMPLETED, etc.).

**Payment declined email:** `notifyPaymentDeclined` calls the dedicated `sendPaymentDeclinedEmail` method. The email shows the decline reason (if provided) and instructions to visit the website and enter the Booking ID to re-upload — no token link.

---

## 10. Authentication System

Authentication is handled by **Supabase Auth** with the NestJS backend acting as a proxy for signup/reset operations.

### Email Signup Flow

`POST /api/auth/signup` with `{ email, password, fullName, phone?, redirectTo? }`

1. Calls `supabase.auth.admin.generateLink({ type: 'signup', email, password, ... })`
   - This creates the user in Supabase Auth but marks them as unverified
   - Returns a one-time `action_link` (the confirmation URL)
2. If phone provided → updates `profiles.phone` via admin client
3. Sends verification email via Brevo with the `action_link` as the confirm button URL
4. If email send fails → deletes the created user (cleanup) → throws `500`

**Why generate a link instead of signUp directly?** The standard `auth.signUp()` sends Supabase's built-in email. Using `generateLink` + Brevo gives full control over the email template.

### Password Reset Flow

`POST /api/auth/request-password-reset` with `{ email, redirectTo? }`

1. IP-based rate limiting: max 3 requests per 60 seconds per IP — tracked in the `password_reset_attempts` Supabase table
2. Calls `supabase.auth.admin.generateLink({ type: 'recovery', email, ... })`
3. If user doesn't exist: Supabase returns error → backend logs it but returns the same ambiguous success message (prevents email enumeration)
4. Sends password reset email with 1-hour expiring link via Brevo

**Rate limiter implementation (DB-backed):**
```typescript
// Inserts a row into password_reset_attempts with (ip_address, attempted_at)
// Counts rows for the IP in the last 60 seconds; if count >= 3 → throws 429
// DB-backed: persists across server restarts; safe under multiple instances
```

### Google OAuth Flow

`GET /api/auth/google?redirectTo=http://localhost:3000`

1. Calls `supabase.auth.signInWithOAuth({ provider: 'google', options: { skipBrowserRedirect: true } })`
2. Returns `{ url }` — the Google OAuth URL the user should be redirected to
3. After Google auth, Supabase redirects back to `redirectTo` URL with hash params
4. Frontend `supabase.auth.onAuthStateChange()` picks up the `SIGNED_IN` event

### Token Validation (AuthGuard)

Every protected request:
1. Extracts `Authorization: Bearer <token>` header
2. Calls `supabase.getClient().auth.getUser(accessToken)` — validates against Supabase's anon client (respects JWT expiry)
3. Returns `user.id` to the controller → passed to service as `requestingUserId`

### Email Change Flow

`PATCH /api/auth/request-email-change` (requires auth) with `{ newEmail }`

1. Validates new email ≠ current email
2. Calls `supabase.auth.admin.generateLink({ type: 'email_change_new', email: currentEmail, newEmail })`
3. Sends confirmation email to the **new** email address with the action link
4. User clicks link → Supabase updates their email in Auth
5. After confirmation, user must log out and log back in (session doesn't auto-refresh)

### Supabase Auth vs Profiles Table

Supabase Auth stores: `email`, `password` (hashed), `user_metadata.full_name`, OAuth tokens.

The `profiles` table (separate) stores: `id` (FK to auth.users), `role` (`admin`/`user`), `full_name`, `phone`. It is populated by a Supabase DB trigger on `auth.users INSERT`.

The role check for admin operations always reads from `profiles.role`, not from the JWT or user_metadata.

---

## 11. File Upload & Storage

**Two Supabase Storage buckets:**

| Bucket | Contents | Path pattern |
|---|---|---|
| `payment-proofs` | Customer payment screenshots, progress update images | `proofs/[timestamp]-[sanitized_filename]` |
| `shop-assets` | Payment method QR codes | `qr/[timestamp]-[sanitized_filename]` |

**Upload pattern (always two steps):**

```
Step 1: GET /api/storage/upload-url?fileName=screenshot.png
        (+ auth token OR bookingId + statusToken for guests)
        ← returns { signedUrl, path }

Step 2: fetch(signedUrl, { method: 'PUT', body: fileBlob })
        (direct browser → Supabase Storage, backend not involved)
```

Then the `path` is included in the next API call (booking creation, progress update, etc.).

**Bucket routing for view URLs:**
- Path starts with `qr/` or `assets/` → `shop-assets` bucket
- Everything else → `payment-proofs` bucket

**Access control on `getSignedViewUrl()`:**
- Admin JWT → can view any file
- Customer JWT → `verifyUserOwnsPath()` checks `bookings.payment_proof_path = path AND user_id = userId`
- Guest (no JWT) → `validateGuestToken()` + `verifyBookingMatchesPath()` checks `bookings.payment_proof_path = path AND id = bookingId`

All signed URLs expire in 1 hour.

---

## 12. Schedule & Overrides System

**Default schedule** is a single row in `branch_schedules`:
```sql
id       = 'default'  (or first row)
open_time    = '08:00'   (24h format, HH:MM)
close_time   = '17:00'
slot_interval_h = 1
branch_name = 'Baliwag'
```

If no row exists, `updateScheduleSettings()` inserts a new one with the above defaults + any provided updates.

**Schedule overrides** are date-specific rows in `schedule_overrides`:
```sql
override_date = '2026-12-25'
is_closed     = true        -- full closure
custom_open   = null        -- or '09:00' for different hours
custom_close  = null        -- or '15:00'
label         = 'Christmas' -- display label for admin UI
```

**Conflict resolution in availability endpoint:**
1. If override exists for date AND `is_closed = true` → return immediately (no slots)
2. If override exists AND not closed → use `custom_open`/`custom_close` (or fall back to schedule defaults for missing fields)
3. If no override → use branch_schedules values

**`UPSERT` on override_date:** Adding an override for a date that already has one replaces it. Deleting removes it entirely — the date reverts to the default schedule.

---

## 13. Payment Methods Management

**Table:** `payment_settings`

| Column | Type | Purpose |
|---|---|---|
| `payment_method` | PK (text) | e.g. `'GCash'`, `'Bank Transfer'` |
| `account_name` | text | Name on the account |
| `account_number` | text | Account/mobile number |
| `qr_image_path` | text nullable | Path in `shop-assets` bucket |
| `updated_at` | timestamp | Last modified |

`UPSERT` on `payment_method` — adding a payment method with the same name overwrites the existing one.

**`getPublicPaymentSettings()`** (no auth, called at checkout):
- Fetches all payment methods
- For each with a `qr_image_path` → generates a 1-hour signed URL from `shop-assets` bucket
- Returns `{ payment_method, account_name, account_number, qr_image_path, qr_signed_url }`

This is how the QR code image appears on the checkout/payment form for customers.

---

## 14. Service Package Management

**Table:** `services`

Key columns: `id`, `category` (LUBE/GROOMING/COATING), `name`, `description`, `duration_hours`, `is_active`, `is_lube_flat`, `lube_prices` (JSON), `price_small`, `price_medium`, `price_large`, `price_extra_large`, `vehicle_type`.

Services are **never deleted** — only deactivated (`is_active = false`). Inactive services don't appear in the catalog and cannot be booked.

**Updating a service** (`PATCH /api/services/:id`, admin only):
- Allowed fields: `name`, `description`, `duration_hours`, `price_small`, `price_medium`, `price_large`, `price_extra_large`, `lube_prices`
- Changes take effect immediately for new bookings (existing bookings store `service_name` as a string snapshot, so they're unaffected)

**Frontend constants vs DB:**
`constants.ts` has hardcoded service definitions for offline fallback. The `api.getServices()` call fetches live data from `GET /api/services`. If the API call succeeds, the frontend uses the API data (including DB prices). If it fails, the hardcoded constants are shown. This can cause price discrepancies if DB prices were edited but the user is offline.

---

## 15. Frontend Auth State Machine

The frontend auth state lives in `App.tsx` and is distributed via **AuthContext** (`wash-and-go-SE2/context/AuthContext.tsx`). Any component can call `useAuth()` to get `{ user, token, forceRecoveryMode }` without props.

```
App.tsx state:
  user: User | null          — Supabase Auth user object
  profile: Profile | null    — profiles table row (role, full_name, phone)
  isStaff: boolean           — derived: profile.role === 'admin'
  bookings: Booking[]        — all (admin) or own (customer)
  loadingAuth: boolean       — true during initial session check
  recoveryMode: boolean      — true when PASSWORD_RECOVERY auth event fires
```

### Initialization sequence on mount

```
1. supabase.auth.getSession()
   ├── session exists → setUser(session.user) → fetchProfile(user.id)
   │     └── profile.role === 'admin' → setIsStaff(true) → fetchAllBookings()
   │                                   → setIsStaff(false) → fetchMyBookings()
   └── no session → user stays null

2. supabase.auth.onAuthStateChange((event, session) => {
     'SIGNED_IN'        → setUser + fetchProfile + fetchBookings
     'SIGNED_OUT'       → clear all state, view → 'HOME'
     'PASSWORD_RECOVERY'→ setRecoveryMode(true), view → 'AUTH'
     'TOKEN_REFRESHED'  → update user only
   })
```

### Booking refresh logic

```typescript
// Auto-refresh interval: every 10 seconds when on STATUS or PROFILE view
useEffect(() => {
  if (view !== 'STATUS' && view !== 'PROFILE') return;
  const interval = setInterval(fetchBookings, 10_000);
  return () => clearInterval(interval);
}, [view, user]);

// Also refresh on window focus
useEffect(() => {
  const handler = () => fetchBookings();
  window.addEventListener('focus', handler);
  return () => window.removeEventListener('focus', handler);
}, [user]);
```

### View guards

```
handleViewChange(target):
  'ADMIN' → if (!isStaff) → redirect to 'AUTH'
  'PROFILE' → if (!user) → redirect to 'AUTH'
  'CLIENT' → allowed for all (auth optional on booking)
  'AUTH' → if (user && !recoveryMode) → redirect to 'HOME'
```

Props passed to all components that need navigation: `onViewChange: (view: ViewType) => void`

Auth state (`user: AppUser | null`, `token: string | null`, `forceRecoveryMode: boolean`) is available via `useAuth()` — no need to pass these as props. Components still receive `bookings`, `services`, and handler callbacks as props.

**CLIENT view guard:** Unauthenticated guests can reach the booking wizard — the frontend gate was removed (Plan A). The backend `POST /api/bookings` uses `OptionalAuthGuard` and has always accepted guest bookings.

---

## 16. Security Hardening

### HTTP Headers

**Frontend (Cloudflare Pages):** `wash-and-go-SE2/public/_headers` applies to all routes:
- `Content-Security-Policy` — restricts scripts/styles to self + trusted CDN origins; blocks inline eval
- `Strict-Transport-Security: max-age=31536000; includeSubDomains` — HSTS
- `Permissions-Policy` — disables camera, microphone, geolocation
- `X-Frame-Options: DENY` — blocks iframe embedding

**Backend (NestJS `main.ts`):** Helmet middleware adds:
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-XSS-Protection: 0` (modern recommendation — rely on CSP instead)

### Request Body Limits

NestJS body size limit: **10 KB** for JSON payloads (set via `express.json({ limit: '10kb' })` in `main.ts`). Rejects oversized requests with `413 Payload Too Large`.

### File Upload Validation

In `StorageService.createSignedUploadUrl()`:
- **Size limit:** Maximum 5 MB per file — enforced via Supabase Storage bucket policy and backend validation
- **Extension whitelist:** Only `['.jpg', '.jpeg', '.png', '.webp']` allowed — checked against filename before generating signed URL; throws `400` on violation
- **MIME type validation:** Optional `mimeType` query param cross-checked against the extension (e.g., `image/jpeg` must pair with `.jpg` / `.jpeg`). Throws `400` if MIME type is unknown or mismatched. Called from `StorageController.getSignedUploadUrl()` with the client-supplied `file.type`.
- **Path traversal guard:** Filename sanitized to strip `..` and path separators before use in storage paths

### Input Sanitization

`stripHtml(str)` utility (defined in `bookings.service.ts`) strips all HTML tags from user-provided strings before storage:
```typescript
function stripHtml(str: string): string {
  return str?.replace(/<[^>]*>/g, '') ?? str;
}
```

Applied to: `customer_name`, `customer_phone`, `notes`, `decline_reason`, and all admin-editable booking fields. Prevents XSS injection in email templates and DB storage.

Email templates additionally use `escapeHtml()` before injecting any value into HTML output.

### Honeypot (Bot Protection)

`CreateBookingDto` includes a `website` field (optional, not shown to users). Real users leave it blank. Bots that auto-fill forms will include a value → booking creation returns `400 BadRequestException` immediately before any DB work.

### Rate Limiting

| Endpoint | Limit | Window |
|---|---|---|
| Global (all routes) | 20 req | 60 s |
| `POST /api/bookings` (booking creation) | 3 req | 60 s |
| `POST /api/bookings/status` (guest status lookup) | 10 req | 60 s |
| `POST /api/bookings/:id/payment-proof` (reupload) | 5 req | 5 min |
| `POST /api/auth/check-email` | 10 req | 60 s |
| `POST /api/auth/request-password-reset` | 3 req | 60 s (DB-tracked) |

---

## 17. Admin Audit Logging

### AuditLogService

`AuditLogService` (global NestJS module) records admin actions to the `admin_audit_logs` Supabase table.

```typescript
interface AuditLog {
  admin_user_id: string;   // UUID of the admin who performed the action
  action: string;          // e.g. 'CONFIRM_PAYMENT', 'DECLINE_PAYMENT', 'UPDATE_STATUS', 'EDIT_BOOKING', 'ADD_PROGRESS_UPDATE', 'UPDATE_PRICE'
  target_id: string;       // booking ID or service ID
  target_type: string;     // 'booking' | 'service'
  details: object;         // action-specific data (old value, new value, reason, etc.)
  created_at: timestamp;
}
```

### Logged Operations

| Action | Trigger | Details logged |
|---|---|---|
| `CONFIRM_PAYMENT` | Admin confirms payment | `{ bookingId, prevStatus: 'PENDING_VERIFICATION' }` |
| `DECLINE_PAYMENT` | Admin declines payment | `{ bookingId, reason }` |
| `UPDATE_STATUS` | Admin changes booking status | `{ bookingId, fromStatus, toStatus }` |
| `EDIT_BOOKING` | Admin edits booking fields | `{ bookingId, changedFields }` |
| `ADD_PROGRESS_UPDATE` | Admin posts a progress update | `{ bookingId, message }` |
| `UPDATE_PRICE` | Admin edits service price | `{ serviceId, changedFields }` |
| `ISSUE_MEMBERSHIP` | Admin issues a Club Wash & Go membership | `{ membershipNo, memberName, vehicleCount }` |
| `RENEW_MEMBERSHIP` | Admin renews a membership | `{ previousExpiry, newExpiry }` |
| `CANCEL_MEMBERSHIP` | Admin cancels a membership | `{}` |
| `ADD_MEMBERSHIP_VEHICLE` | Admin adds a vehicle to a membership | `{ plateNumber }` |
| `REMOVE_MEMBERSHIP_VEHICLE` | Admin removes a vehicle from a membership | `{ plateNumber }` |
| `MEMBERSHIP_VISIT_RECORDED` | A booking tied to a membership completes | `{ bookingId, newVisitCount, newFreeWashCredits, discountType }` |

### Required DB Table

```sql
CREATE TABLE admin_audit_logs (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_user_id uuid NOT NULL REFERENCES auth.users(id),
  action      text NOT NULL,
  target_id   text NOT NULL,
  target_type text NOT NULL,
  details     jsonb,
  created_at  timestamptz DEFAULT now()
);
```

Audit log inserts are **fire-and-forget** (non-blocking) — a logging failure never causes the API action to fail.

---

## 18. Club Wash & Go Membership Program

A paid annual membership (₱300/year, sold and renewed **offline** — cash/card at the counter, never through the app) covering up to 3 vehicles. The software only records that a membership exists and applies its benefits at booking time. **A membership can only be issued to an existing Wash & Go account** — there is no offline/no-account path.

### Data Model

| Table | Purpose |
|---|---|
| `memberships` | One row per membership: `membership_no` (`CWG-000123`, randomly generated — see below), `member_name`, `user_id` (required — the account this membership belongs to), `issued_by`, `purchase_date`, `expires_at`, `status` (`ACTIVE`/`EXPIRED`/`CANCELLED`), `visit_count` (shared across all vehicles), `first_wash_used`, `free_wash_credits`, `terms` (reserved jsonb, unused today) |
| `membership_vehicles` | `membership_id`, `plate_number` (globally unique — a plate can only be active on one membership at a time — stored normalized, see below), `vehicle_label`. Capped at 3 rows per membership, enforced in `MembershipsService` |

**Membership number generation:** `generateMembershipNo()` picks a random 6-digit number (`Math.floor(100000 + Math.random() * 900000)`), the same pattern already used for booking IDs — not a sequential counter. A sequential `CWG-000001, CWG-000002, ...` scheme would let anyone enumerate every member's name and plates through the public `POST /api/memberships/lookup` endpoint just by counting upward; random numbers make that infeasible. The DB's unique constraint on `membership_no`, combined with `issue()`'s existing `23505` collision handler (`ConflictException` → caller retries), covers the rare random collision.

**Plate number normalization:** `normalizePlate()` (`src/memberships/plate.util.ts`) uppercases and strips all non-alphanumeric characters (spaces, dashes) before a plate is stored or matched. Applied at every write site (`issue()`, `addVehicle()`) and at the read chokepoint (`findActiveMembershipForPlate()`), plus mirrored on `VehicleDto`/`CreateBookingDto` via a `@Transform` decorator (`@MaxLength(10)`, based on real PH plate formats topping out at 7 characters). This means `ABC1234`, `abc 1234`, and `abc-1234` all resolve to the same vehicle — staff and customers don't need to type plates identically for discount matching to work.
| `services.membership_discount_pct` | Nullable int on the existing `services` table — tags which services carry a membership discount and at what rate (Antibac 50%; Oil Change/Rust Proof/Ceramic Tint/Ceramic Coating 10%). `NULL` = not eligible |
| `bookings.membership_id` / `membership_discount_type` / `membership_visit_counted` | Stamped on the booking at creation time so the applied discount is traceable and visit-counting can't double-fire |

### Discount Priority Rule

When a booking's `plateNumber` matches a vehicle on a currently `ACTIVE`, non-expired membership, `MembershipsService.computeDiscount()` applies **exactly one** discount, in this order:

1. **`FREE_WASH`** — GROOMING (car wash) bookings only, `free_wash_credits > 0` → 100% off (`totalPrice = 0`). Takes priority because it's an already-earned full comp. The reward is literally "a free car wash," so it never triggers on a Lube or Ceramic Coating booking.
2. **`FIRST_WASH`** — GROOMING (car wash) bookings only, no credit but `first_wash_used = false` → 50% off. The one-time new-member offer — "50% off first car wash," same category restriction.
3. **`CATEGORY_PERCENT`** — any category, and the service has `membership_discount_pct` set → that % off. This is what covers non-car-wash services (Oil Change, Rust Proof, Ceramic Tint, Ceramic Coating) as well as Antibac (which is itself a GROOMING service).
4. Otherwise, full price (the booking still stamps `membership_id` for visit-counting purposes even when no discount applies).

Discounts never stack — only the highest-priority match wins. A Lube or Ceramic Coating booking can still receive its own `CATEGORY_PERCENT` tag, but can never consume a free-wash credit or the first-wash offer.

### Visit Counting & Redemption (car-wash-gated)

The discount is **computed and shown at booking creation** (so pricing is correct immediately), but the counters only move when the booking later transitions **into** `COMPLETED` via `PATCH /api/bookings/:id/status` — never at creation. This is deliberate: a cancelled or no-show booking must not burn a benefit it never delivered.

`BookingsService.updateStatus()` fetches the booking's prior status before updating; if the new status is `COMPLETED` and the prior status wasn't already `COMPLETED`, it calls `MembershipsService.onBookingCompleted()`, which first looks up the booking's service category:

- **Not a GROOMING (car wash) booking** — e.g. Lube or Ceramic Coating — the visit counter and credits are left untouched (any `CATEGORY_PERCENT` discount was already applied at creation and needs no redemption). Only `bookings.membership_visit_counted` is set to `true` so it isn't re-processed.
- **A GROOMING (car wash) booking:**
  1. Increments `visit_count` by 1.
  2. If the new `visit_count` is a multiple of 10 → increments `free_wash_credits` by 1.
  3. If the booking's `membership_discount_type` was `FREE_WASH` → decrements `free_wash_credits` by 1 (redeeming the credit that was granted on a prior 10th visit).
  4. If the booking's `membership_discount_type` was `FIRST_WASH` → sets `first_wash_used = true`.
  5. Sets `bookings.membership_visit_counted = true` — the idempotency guard. Since admin can set a booking's status to any value any number of times (no state machine, see §1), flapping a booking `COMPLETED → IN_PROGRESS → COMPLETED` must not double-count; this flag is checked before any of the above runs.
  6. If step 2 just granted a new credit (this specific visit crossed a multiple of 10), fires the "free wash earned" email (`void this.notifyFreeWashEarned(...)`) — fire-and-forget, same as every other membership email.

**Manual walk-in visits:** since most actual car washes are walk-ins that never go through the booking system, an admin can also log a visit directly from the Memberships admin panel (`MembershipsPanel.tsx`'s `− N +` stepper) via `POST /api/memberships/:id/visits/increment` (`MembershipsService.incrementVisit()`) or `.../decrement` (`.decrementVisit()`). Both call the same `applyVisitDelta()` helper the booking-completion path uses for the increment/credit-earning math, so the "every 10th visit earns a free wash" rule is identical regardless of which path recorded the visit. The manual path never touches `first_wash_used` and never redeems a `FREE_WASH`/`FIRST_WASH` credit — those remain exclusively tied to actual bookings; it only increments (or, via "−", undoes an accidental increment to) the shared counter and grants/revokes the milestone credit. Only `ACTIVE` memberships can be adjusted this way (enforced server-side). Because both paths write to the same counter independently, an admin marking a GROOMING booking `COMPLETED` and also manually logging "+" for that same wash would double-count — there's no cross-path guard against this, so front-desk staff should use one path or the other for a given visit, not both.

### Admin Issuance Flow ("Make a Member")

Because a membership requires an existing account, issuance is account-first, not a blank form:

1. Admin opens **Memberships → Make a Member** and searches by name, phone, or email.
2. `GET /api/memberships/customer-search?query=` finds matching accounts by name or phone via `profiles` (populated for every account on signup, so **brand-new accounts with zero bookings are found too**) plus email via the Supabase Auth admin API (`auth.admin.listUsers()`, since email isn't stored in `profiles`), merged into one result set. **Admin accounts (`profiles.role = 'admin'`) are always excluded** — membership is a customer perk, so the name/phone query filters on `role = 'customer'` directly, and any email match is cross-checked against `profiles.role` afterward and dropped if it's an admin.
3. Selecting a result loads that account's **car-wash-only** booking history via `GET /api/memberships/customers/:userId/carwash-history` (`services.category = 'GROOMING'` — Lube and Ceramic Coating bookings are excluded, since those aren't part of what the membership tracks).
4. Clicking **Make a Member** reveals the vehicle-registration form (1–3 plates), pre-filled with the account's name. Submitting calls `POST /api/memberships` with that `userId` attached, so the membership immediately appears in the customer's own profile — and fires the "Welcome to Club Wash & Go" email (`void this.notifyMembershipIssued(...)`) to that account's email, fire-and-forget. `POST /api/memberships/:id/renew` fires the equivalent "Membership Renewed" email the same way.

### Expiry Handling (daily cron job)

`MembershipsService.handleDailyMembershipExpiryCheck()` runs once a day (`@Cron(CronExpression.EVERY_DAY_AT_1AM)`, via `@nestjs/schedule`'s `ScheduleModule.forRoot()` in `app.module.ts`) and delegates to `processMembershipExpiries()` — kept as a separate, directly-callable method so tests (and manual verification) don't have to wait on the actual schedule. Each run sweeps all `ACTIVE` memberships:

- **Already past `expires_at`** — flips `status` to `EXPIRED` and fires the "membership expired" email (`sendMembershipExpiredEmail`). This is also what fixes the stale-badge problem: before this job existed, a lapsed membership's `status` column stayed `ACTIVE` forever (the admin dashboard would show a green "Active" badge on a membership that discount logic had already started rejecting, since `computeDiscount` separately checks `expires_at >= today`) until someone happened to manually renew or cancel it.
- **Within 30 days of `expires_at`, reminder not yet sent** — fires the "expiring soon" email (`sendMembershipExpiringSoonEmail`) and stamps `memberships.expiring_reminder_sent_at` with the current timestamp.

**Why the stamp column exists:** the 30-day window is true for 30 consecutive days, not just once — without a "have I already told them" flag, the daily job would re-send the same reminder every single day for a month. `expiring_reminder_sent_at` (nullable timestamptz, added in `membership-expiry-tracking.sql`) is that flag: the query only selects memberships where it `is null`, and it's set the moment the email fires. `renew()` resets it back to `null` (`expiring_reminder_sent_at: null` in the update payload) so the reminder can fire again for the membership's *next* expiry cycle.

Cron-driven mutations are **not** run through `AuditLogService` — that table requires a real `admin_user_id` (FK to `auth.users`), and there's no admin actor for an automatic sweep. These are logged via the regular NestJS `Logger` instead.

### Endpoints

| Endpoint | Auth | Notes |
|---|---|---|
| `POST /api/memberships` | Admin | Issue — `userId` required, generates a random `membership_no` (not sequential — see Data Model above), inserts vehicles in the same call |
| `GET /api/memberships/customer-search?query=` | Admin | Find any existing **customer** account by name/phone (via `profiles`) or email (via the Auth admin API) — includes accounts with zero bookings; admin accounts are always excluded |
| `GET /api/memberships/customers/:userId/carwash-history` | Admin | That account's GROOMING-only booking history, for the "Make a Member" profile view |
| `POST /api/memberships/:id/renew` | Admin | Extends `expires_at` by 1 year from the current expiry if still active, or from today if lapsed |
| `POST /api/memberships/:id/cancel` | Admin | Sets `status = CANCELLED` |
| `POST /api/memberships/:id/vehicles` / `DELETE /api/memberships/:id/vehicles/:vehicleId` | Admin | Add (capped at 3) / remove a vehicle |
| `GET /api/memberships?search=` / `GET /api/memberships/:id` | Admin | Search by name or membership no. / detail view |
| `POST /api/memberships/lookup` | Public (throttled 10/60s) | Guest lookup by membership no. — mirrors `POST /api/bookings/status`. Returns a reduced public view (no `issuedBy`/`userId`) |
| `GET /api/memberships/me` | Authenticated | Logged-in customer's own active membership, or `null` |
| `GET /api/memberships/vehicle-status?plateNumber=` | Public (throttled 20/60s) | Lightweight discount-state preview (no personal fields) used by the booking wizard to show which discount will apply before the customer submits |

### Frontend

- **Admin dashboard** — "Memberships" tab (`MembershipsPanel.tsx`): the "Make a Member" flow above, plus manage vehicles (add/remove, capped at 3), renew, cancel, view visit count and free-wash-credit balance, and manually log/undo a walk-in visit via the +/- stepper.
- **Customer-facing** — `MembershipStatusCard.tsx` (shared) shows status, progress toward the next free wash (or a "free wash ready" banner), first-wash-offer reminder, and vehicles. Rendered in `UserProfile.tsx` for logged-in members (auto-fetched via `/memberships/me`) and in `CheckStatus.tsx`'s guest "Membership" tab (lookup by membership no., mirroring the Booking ID lookup pattern).
- **Booking wizard** — `PaymentForm.tsx` fetches `/memberships/vehicle-status` for the entered plate number and mirrors the same FREE_WASH → FIRST_WASH → CATEGORY_PERCENT priority logic (car-wash-gated) client-side to show which discount applies and why in the pricing summary. Display only — the backend recomputes and applies the authoritative discount at booking creation.
