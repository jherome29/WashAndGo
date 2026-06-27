# Security Hardening Design — 2026-06-27

## Scope

9 security improvements applied to the Wash & Go Auto Salon booking platform (NestJS backend + React/Vite frontend on Cloudflare Pages). Items 5 (DB-backed password reset rate limiting) and 10 (admin audit log) are deferred — both require new Supabase tables that the user will create separately.

---

## Item 1 — Content Security Policy (CSP)

### Backend (`wash-and-go-backend/src/main.ts`)

The backend is a pure JSON REST API — no HTML, JS, or CSS is served. Replace `helmet()` default call with explicit configuration:

```typescript
helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
})
```

`default-src 'none'` is the strictest possible policy for an API. `crossOriginEmbedderPolicy: false` avoids breaking cross-origin API calls.

### Frontend (`wash-and-go-SE2/public/_headers`)

Cloudflare Pages reads `public/_headers` at build time and injects the headers on every response. Create this file:

```
/*
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https:; connect-src 'self' https://wash-and-go-front-back-production.up.railway.app https://kgpwahbpjrnwswwevmlt.supabase.co https://*.supabase.co; font-src 'self' data: https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self';
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
```

`script-src 'unsafe-inline'` is required because Vite's production build injects a small inline script for the module entry point. `connect-src` explicitly allows the Railway backend and Supabase endpoints used by the frontend.

---

## Item 2 — Request Body Size Limit

### Backend (`wash-and-go-backend/src/main.ts`)

Disable NestJS's default body parser and configure explicit limits:

```typescript
import { json, urlencoded } from 'express';

const app = await NestFactory.create(AppModule, { bodyParser: false });
app.use(json({ limit: '50kb' }));
app.use(urlencoded({ extended: true, limit: '50kb' }));
```

50 KB is generous for all existing payloads (booking creation, progress updates, price edits). This prevents oversized JSON payloads from reaching NestJS controllers.

---

## Item 3 — Permissions-Policy Header

### Backend (`wash-and-go-backend/src/main.ts`)

Helmet does not set `Permissions-Policy` by default. Add a lightweight middleware after Helmet:

```typescript
app.use((_req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  next();
});
```

Disabling camera, microphone, geolocation, and payment features prevents the browser from granting these APIs to scripts running in the context of any admin or customer-facing page served from the same origin.

---

## Item 6 — File Upload Size Enforcement

### Backend

**`storage.controller.ts`** — Add optional `fileSize` query param:
```typescript
@Query('fileSize') fileSize?: string
```
Pass it to `storageService.createSignedUploadUrl()`.

**`storage.service.ts`** — Validate before issuing the URL:
```typescript
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
if (fileSize !== undefined && Number(fileSize) > MAX_BYTES) {
  throw new BadRequestException('File exceeds the 5 MB size limit');
}
```

### Frontend (`wash-and-go-SE2/lib/api.ts`)

Update `getSignedUploadUrl` to accept and forward `fileSize`:
```typescript
getSignedUploadUrl: (fileName, bookingId?, statusToken?, authToken?, fileSize?) => {
  const params = new URLSearchParams({ fileName });
  if (bookingId) params.set('bookingId', bookingId);
  if (statusToken) params.set('statusToken', statusToken);
  if (fileSize !== undefined) params.set('fileSize', String(fileSize));
  ...
}
```

All call sites that have access to `file.size` (BookingWizard PaymentForm step, CheckStatus reupload) pass `file.size`.

---

## Item 7 — Error Response Sanitization

### Backend (`wash-and-go-backend/src/common/filters/global-exception.filter.ts`)

Current issues:
- The 500 message says "couldn't save your booking" even on auth/storage/services errors
- Actual error details are not logged, making debugging hard

Changes:
1. Replace the hardcoded booking-specific message with a generic `"An unexpected error occurred. Please try again."`
2. Inject `Logger` and log the actual exception (message + stack) at `error` level for every 500
3. Keep 4xx responses unchanged — validation and business logic errors are still returned verbatim

---

## Item 8 — Auth Endpoint Rate Limiting

### Backend (`wash-and-go-backend/src/auth/auth.controller.ts`)

Current state:
- Class-level: `@Throttle({ default: { ttl: 60_000, limit: 10 } })` — 10 req/min on all auth routes
- `signup`: overridden to 5/min + 2min block ✓
- `request-password-reset`: overridden to 5/min + 2min block ✓
- `GET /auth/google`: no override — inherits 10/min

Changes:
- Reduce class-level default from `limit: 10` to `limit: 5`
- Add explicit `@Throttle({ default: { limit: 3, ttl: 60000 } })` on `GET /auth/google` to limit OAuth redirect abuse

---

## Item 9 — npm Dependency Audit

Run `npm audit fix` (safe, non-breaking only) on:
1. `wash-and-go-backend/`
2. `wash-and-go-SE2/`

Report what was resolved and what remains unfixed without `--force`. No `--force` flag.

---

## Item 11 — Honeypot on Booking Creation

### Backend

**`wash-and-go-backend/src/bookings/dto/create-booking.dto.ts`**
Add:
```typescript
@IsOptional()
@IsString()
honeypot?: string;
```

**`wash-and-go-backend/src/bookings/bookings.service.ts`** — top of `create()`:
```typescript
if (dto.honeypot) throw new BadRequestException('Invalid booking request');
```

The `ValidationPipe` with `whitelist: true` is already set globally, so `honeypot` must be declared in the DTO to pass through. The error message is intentionally generic.

### Frontend (`wash-and-go-SE2/components/BookingWizard.tsx`)

Add a visually hidden input inside the booking form so real users never interact with it:
```tsx
<input
  type="text"
  name="website"
  value=""
  onChange={() => {}}
  tabIndex={-1}
  autoComplete="off"
  aria-hidden="true"
  style={{ display: 'none' }}
/>
```

Always include `honeypot: ''` in the booking submission payload. Bots that auto-fill form fields will populate it; real users will not.

---

## Item 12 — Status Token Rotation After Reupload

### Backend (`wash-and-go-backend/src/bookings/bookings.service.ts`)

After the successful DB update in `reuploadProof()`:

```typescript
const newPlainToken = randomBytes(32).toString('hex');
const newTokenHash = createHash('sha256').update(newPlainToken).digest('hex');
const newExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

await this.supabase.getAdminClient()
  .from('bookings')
  .update({ status_token_hash: newTokenHash, status_token_expires_at: newExpiry })
  .eq('id', id.toUpperCase());

void this.notifyAdminsPaymentReview(this.toBooking(data));
return { ...this.toBooking(data), statusToken: newPlainToken };
```

### Frontend

**`wash-and-go-SE2/lib/api.ts`** — update return type:
```typescript
reuploadProof: (...) => request<Booking & { statusToken?: string }>(...)
```

**`wash-and-go-SE2/components/CheckStatus.tsx`** — in the `onReuploadSuccess` handler, if `response.statusToken` is present, update the local token state so subsequent `getBookingByToken` calls use the new token.

---

## Files Changed

| File | Change |
|------|--------|
| `wash-and-go-backend/src/main.ts` | CSP, body limit, Permissions-Policy |
| `wash-and-go-backend/src/common/filters/global-exception.filter.ts` | Generic 500 message + logging |
| `wash-and-go-backend/src/auth/auth.controller.ts` | Reduce class throttle, add Google OAuth throttle |
| `wash-and-go-backend/src/storage/storage.controller.ts` | Add fileSize query param |
| `wash-and-go-backend/src/storage/storage.service.ts` | Validate fileSize ≤ 5 MB |
| `wash-and-go-backend/src/bookings/dto/create-booking.dto.ts` | Add honeypot field |
| `wash-and-go-backend/src/bookings/bookings.service.ts` | Honeypot check + token rotation |
| `wash-and-go-SE2/public/_headers` | New file — Cloudflare Pages CSP + headers |
| `wash-and-go-SE2/lib/api.ts` | fileSize param + reuploadProof return type |
| `wash-and-go-SE2/components/BookingWizard.tsx` | Hidden honeypot input + payload field |
| `wash-and-go-SE2/components/CheckStatus.tsx` | Save rotated token from reupload response |

## Out of Scope

- Item 4: Booking ID entropy — deferred
- Item 5: DB-backed password reset rate limiting — requires Supabase table creation
- Item 10: Admin audit log — requires Supabase table creation
