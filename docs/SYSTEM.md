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

**Which statuses block a slot (consume capacity):**
```
SLOT_CHECK_STATUSES = ['PENDING_VERIFICATION', 'CONFIRMED', 'IN_PROGRESS']
```
`PENDING` and `REUPLOAD_REQUIRED` do NOT block a slot. A booking in these states doesn't count toward the capacity limit, which means another customer could take the same slot if they submit with proof first.

**Which statuses count as "active" for display purposes:**
```
ACTIVE_STATUSES = ['PENDING', 'PENDING_VERIFICATION', 'REUPLOAD_REQUIRED', 'CONFIRMED', 'IN_PROGRESS']
```

---

## 2. Booking Creation — Customer Path

**Endpoint:** `POST /api/bookings`  
**Auth:** Optional (OptionalAuthGuard). Works for guests and logged-in customers.

### Step-by-step logic in `BookingsService.create()`

**Step 1 — Validate service**
- Queries `services` table: `id = dto.serviceId AND is_active = true`
- If not found → `404 NotFoundException`
- If service category is `LUBE` but `fuelType` missing → `400 BadRequestException`
- If service category is NOT `LUBE` but `fuelType` provided → `400 BadRequestException`

**Step 2 — Check slot availability (race condition guard)**
- Calls `isSlotAvailable(dto.date, dto.timeSlot, service.category)`
- Counts existing bookings matching: same date + same time slot + same service category + status in `SLOT_CHECK_STATUSES`
- If count ≥ `CAPACITY[category]` → `409 ConflictException`

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
- Guard: booking must be in `PENDING_VERIFICATION`
- Sanitizes reason: `stripHtml(declineReason)`
- Updates: `status → REUPLOAD_REQUIRED`, `payment_decline_reason → sanitizedReason`, `payment_reviewed_at`, `payment_reviewed_by`
- Triggers: "Booking Update" email to customer with status message that includes the decline reason appended as `REUPLOAD_REQUIRED — [reason]`

### 6c. Customer Reuploads Proof

Customer sees "Re-upload" button in CheckStatus or My Bookings when status is `REUPLOAD_REQUIRED`.

1. Customer calls `GET /api/storage/upload-url?fileName=...&bookingId=BK-xxx&token=[plainToken]`
2. Backend validates token: `SHA256(plainToken)` must match `status_token_hash`, expiry must not have passed
3. Returns signed upload URL
4. Customer uploads file directly to Supabase Storage
5. Customer calls `POST /api/bookings/:id/payment-proof` with `{ paymentProofPath, statusToken }`

**Server-side auth on reupload (`reuploadProof()`):**
- If `userId` matches `booking.user_id` → allowed (owner)
- Else: validates token hash + expiry → allowed (guest with valid token)
- If neither → `403 ForbiddenException`

Updates: `status → PENDING_VERIFICATION`, `payment_proof_path → new path`, `payment_decline_reason → null`
Triggers: "New Booking" admin notification email (same as initial creation email) so admins know to review again

---

## 7. Guest Status Token System

Customers who book without logging in (or guests who lose their session) can still check booking status and reupload payment proof using a **status token**.

### How it works

- On booking creation, backend generates: `plainToken = randomBytes(32).toString('hex')`
- `tokenHash = SHA256(plainToken)` stored in `bookings.status_token_hash`
- `tokenExpiry = now + 48 hours` stored in `bookings.status_token_expires_at`
- Response includes `statusToken: plainToken` — shown once to customer in confirmation modal

### What the token enables (without login)

| Action | Endpoint | Token passed as |
|---|---|---|
| View booking details | `GET /api/bookings/status?id=BK-xxx&token=...` | Query param |
| Upload new proof file | `GET /api/storage/upload-url?...&bookingId=BK-xxx&token=...` | Query param |
| Reupload proof | `POST /api/bookings/:id/payment-proof` with `{ statusToken }` | Body |

### Token validation logic

```typescript
const tokenHash = createHash('sha256').update(plainToken).digest('hex');
const tokenExpiry = new Date(data.status_token_expires_at);
if (data.status_token_hash !== tokenHash || tokenExpiry < new Date()) {
  throw new ForbiddenException('Invalid or expired status token');
}
```

### Token expiry

Tokens expire after 48 hours. After expiry, guests cannot check status or reupload without admin intervention. The frontend shows the token prominently in the booking confirmation modal and includes it in the confirmation email. There is no token refresh mechanism — if a token expires during `REUPLOAD_REQUIRED`, the customer must contact the shop.

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
| Payment declined | `sendBookingStatusEmail` (same method) | `booking.customer_email` | `POST /api/bookings/:id/payment/decline` |
| Re-review needed (admin) | `sendBookingCreatedAdminEmail` (same method) | `ADMIN_NOTIFICATION_EMAILS` | `POST /api/bookings/:id/payment-proof` (reupload) |
| Progress update | `sendProgressUpdateEmail` | `booking.customer_email` | `POST /api/bookings/:id/updates` |

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

1. IP-based rate limiting: max 3 requests per 60 seconds per IP (in-memory `Map`)
2. Calls `supabase.auth.admin.generateLink({ type: 'recovery', email, ... })`
3. If user doesn't exist: Supabase returns error → backend logs it but returns the same ambiguous success message (prevents email enumeration)
4. Sends password reset email with 1-hour expiring link via Brevo

**Rate limiter implementation:**
```typescript
private readonly resetRequestTracker = new Map<string, number[]>();
// Tracks timestamps of requests per IP; filters out timestamps older than 60s
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

The entire frontend auth state lives in `App.tsx`. There is no Redux, Zustand, or Context API — props are drilled down.

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

Props passed to every component that needs navigation: `onViewChange: (view: ViewType) => void`
Props passed to components that need auth: `user`, `profile`, `isStaff`, `session` (Supabase session object with `access_token`)
