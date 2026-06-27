# Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply 9 approved security improvements to the Wash & Go booking platform — headers, body limits, rate limiting, file size enforcement, error sanitization, honeypot, and token rotation.

**Architecture:** All backend changes are in the NestJS app at `wash-and-go-backend/`; all frontend changes are in the Vite/React app at `wash-and-go-SE2/`. No new modules or tables are needed — every change touches an existing file or adds a single new config file.

**Tech Stack:** NestJS + Express (backend), React 18 + Vite + TypeScript (frontend), Cloudflare Pages (frontend hosting), helmet, class-validator, express body parser.

## Global Constraints

- No `npm install` of new packages — all required packages (helmet, express, class-validator) are already present.
- No `--force` flag on `npm audit fix`.
- TypeScript must compile with zero new errors after every task (`npx tsc --noEmit` in the relevant sub-project).
- Never alter CORS config, validation pipe settings, or Supabase client code.
- All backend changes compile under Node.js v24 with `cross-env NODE_OPTIONS=--use-system-ca` (already wired into npm scripts).
- Commits use `fix:` or `feat:` prefix per existing history convention.

---

### Task 1: Backend — CSP, Body Limit, Permissions-Policy

**Files:**
- Modify: `wash-and-go-backend/src/main.ts`

**Interfaces:**
- Produces: All HTTP responses from the backend now include `Content-Security-Policy`, `Permissions-Policy`, and enforce a 50 KB request body limit.

- [ ] **Step 1: Open `main.ts` and verify current state**

  Confirm lines 16–17 read:
  ```typescript
  const app = await NestFactory.create(AppModule);
  app.use(helmet());
  ```
  This is what we're replacing.

- [ ] **Step 2: Apply the three changes to `main.ts`**

  Replace the import block at the top:
  ```typescript
  import { NestFactory } from '@nestjs/core';
  import { AppModule } from './app.module';
  import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
  import { Logger, ValidationPipe } from '@nestjs/common';
  import { setDefaultResultOrder } from 'node:dns';
  import helmet from 'helmet';
  import { json, urlencoded } from 'express';
  ```

  Replace lines 16–17 (`NestFactory.create` and `helmet()` call) with:
  ```typescript
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(json({ limit: '50kb' }));
  app.use(urlencoded({ extended: true, limit: '50kb' }));
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    next();
  });
  ```

  The rest of the file (CORS, ValidationPipe, global prefix, global filters, listen) stays unchanged.

- [ ] **Step 3: Verify TypeScript compiles**

  ```bash
  cd wash-and-go-backend && npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 4: Smoke-test headers**

  Start the backend (`npm run start:dev`) then in a separate terminal:
  ```bash
  curl -si http://localhost:3001/api/health | grep -i "content-security-policy\|permissions-policy\|x-frame"
  ```
  Expected lines in response:
  ```
  content-security-policy: default-src 'none'; frame-ancestors 'none'
  permissions-policy: camera=(), microphone=(), geolocation=(), payment=()
  x-frame-options: SAMEORIGIN
  ```

- [ ] **Step 5: Smoke-test body limit**

  ```bash
  # This should be rejected (payload > 50 KB)
  python3 -c "import sys; sys.stdout.write('{\"x\":\"' + 'A'*60000 + '\"}')" | \
    curl -si -X POST http://localhost:3001/api/bookings \
    -H "Content-Type: application/json" --data-binary @-
  ```
  Expected: `413 Payload Too Large`

- [ ] **Step 6: Commit**

  ```bash
  cd wash-and-go-backend
  git add src/main.ts
  git commit -m "fix: strict CSP, 50kb body limit, Permissions-Policy on backend"
  ```

---

### Task 2: Frontend — Cloudflare Pages Security Headers

**Files:**
- Create: `wash-and-go-SE2/public/_headers`

**Interfaces:**
- Produces: All Cloudflare Pages responses for the frontend SPA carry CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, and Permissions-Policy headers.

- [ ] **Step 1: Create `wash-and-go-SE2/public/_headers`**

  Create the file with exactly this content (no trailing newline after the last line):
  ```
  /*
    Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https:; connect-src 'self' https://wash-and-go-front-back-production.up.railway.app https://kgpwahbpjrnwswwevmlt.supabase.co https://*.supabase.co; font-src 'self' data: https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self';
    X-Frame-Options: DENY
    X-Content-Type-Options: nosniff
    Referrer-Policy: strict-origin-when-cross-origin
    Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
  ```

  The indentation before each header line must be **two spaces**. Cloudflare Pages requires that format.

- [ ] **Step 2: Verify the file was created correctly**

  ```bash
  cat wash-and-go-SE2/public/_headers
  ```
  Expected: the `/*` route on its own line, followed by each header indented with two spaces.

- [ ] **Step 3: Verify frontend builds**

  ```bash
  cd wash-and-go-SE2 && npm run build
  ```
  Expected: build completes, `dist/` now contains `_headers`.
  ```bash
  ls wash-and-go-SE2/dist/_headers
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add wash-and-go-SE2/public/_headers
  git commit -m "feat: add Cloudflare Pages CSP and security headers"
  ```

---

### Task 3: Backend — Error Response Sanitization

**Files:**
- Modify: `wash-and-go-backend/src/common/filters/global-exception.filter.ts`

**Interfaces:**
- Produces: 500 responses return `"An unexpected error occurred. Please try again."` instead of the booking-specific message. All 500s are logged with full stack trace.

- [ ] **Step 1: Replace the entire filter file**

  ```typescript
  import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
  import { Response } from 'express';

  @Catch()
  export class GlobalExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(GlobalExceptionFilter.name);

    catch(exception: unknown, host: ArgumentsHost) {
      const ctx = host.switchToHttp();
      const response = ctx.getResponse<Response>();

      if (exception instanceof HttpException) {
        const status = exception.getStatus();

        if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
          this.logger.error(
            (exception as Error).message,
            (exception as Error).stack,
          );
          return response.status(status).json({
            statusCode: status,
            message: 'An unexpected error occurred. Please try again.',
          });
        }

        return response.status(status).json(exception.getResponse());
      }

      this.logger.error(
        (exception as Error)?.message ?? String(exception),
        (exception as Error)?.stack,
      );
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'An unexpected error occurred. Please try again.',
      });
    }
  }
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  cd wash-and-go-backend && npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 3: Smoke-test 500 response**

  Trigger any endpoint that throws a generic error. The easiest is to temporarily call a non-existent Supabase table and watch the response body. Alternatively, confirm the message wording by reading the filter code — the spec has no way to force a 500 locally without mocking.

  Confirm visually that `"couldn't save your booking"` no longer appears anywhere in the filter file:
  ```bash
  grep -n "booking" wash-and-go-backend/src/common/filters/global-exception.filter.ts
  ```
  Expected: no matches.

- [ ] **Step 4: Commit**

  ```bash
  git add wash-and-go-backend/src/common/filters/global-exception.filter.ts
  git commit -m "fix: generic 500 message + structured error logging in GlobalExceptionFilter"
  ```

---

### Task 4: Backend — Auth Endpoint Rate Limiting

**Files:**
- Modify: `wash-and-go-backend/src/auth/auth.controller.ts`

**Interfaces:**
- Produces: Class-level throttle drops from 10 to 5 req/min. Google OAuth redirect is explicitly capped at 3 req/min.

- [ ] **Step 1: Make two edits to `auth.controller.ts`**

  **Edit 1** — change the class-level decorator (line 13):
  ```typescript
  // Before:
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  // After:
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  ```

  **Edit 2** — add `@Throttle` above the `@Get('google')` route:
  ```typescript
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Get('google')
  async googleAuth(
    @Query('redirectTo') redirectTo: string,
    @Res() res: Response,
  ) {
    const fallback = 'http://localhost:5173/auth/callback';
    const url = await this.authService.getGoogleOAuthUrl(redirectTo || fallback);
    return res.redirect(url);
  }
  ```

- [ ] **Step 2: Verify the full controller looks correct**

  ```bash
  cat wash-and-go-backend/src/auth/auth.controller.ts
  ```
  Confirm:
  - Class decorator: `limit: 5`
  - `POST signup`: `limit: 5, ttl: 60000, blockDuration: 120000` (unchanged)
  - `POST request-password-reset`: `limit: 5, ttl: 60000, blockDuration: 120000` (unchanged)
  - `GET google`: `limit: 3, ttl: 60_000` (new)

- [ ] **Step 3: Verify TypeScript compiles**

  ```bash
  cd wash-and-go-backend && npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 4: Commit**

  ```bash
  git add wash-and-go-backend/src/auth/auth.controller.ts
  git commit -m "fix: tighten auth throttle to 5/min, limit Google OAuth to 3/min"
  ```

---

### Task 5: Backend + Frontend — File Upload Size Enforcement

**Files:**
- Modify: `wash-and-go-backend/src/storage/storage.controller.ts`
- Modify: `wash-and-go-backend/src/storage/storage.service.ts`
- Modify: `wash-and-go-SE2/lib/api.ts`
- Modify: `wash-and-go-SE2/components/PaymentForm.tsx`
- Modify: `wash-and-go-SE2/components/CheckStatus.tsx`

**Interfaces:**
- Consumes: `file.size` (number, bytes) from the two frontend call sites.
- Produces: `POST /api/storage/upload-url?fileSize=N` rejects with 400 if `N > 5242880`. Frontend passes the file size before requesting a signed URL.

- [ ] **Step 1: Add `fileSize` query param to `storage.controller.ts`**

  Replace the `getUploadUrl` method:
  ```typescript
  @Throttle({ default: { limit: 5, ttl: 300000 } })
  @UseGuards(OptionalAuthGuard)
  @Post('upload-url')
  getUploadUrl(
    @Query('fileName') fileName: string,
    @Query('bookingId') bookingId?: string,
    @Query('statusToken') statusToken?: string,
    @Query('fileSize') fileSize?: string,
    @CurrentUser() user?: any,
  ) {
    return this.storageService.createSignedUploadUrl(fileName, user?.id, bookingId, statusToken, fileSize);
  }
  ```

- [ ] **Step 2: Add size validation to `storage.service.ts`**

  Update the `createSignedUploadUrl` method signature and add the size check at the top of the method, right after the opening brace:

  ```typescript
  async createSignedUploadUrl(
    fileName: string,
    userId?: string,
    bookingId?: string,
    statusToken?: string,
    fileSize?: string,
  ): Promise<{ signedUrl: string; path: string }> {
    const MAX_BYTES = 5 * 1024 * 1024;
    if (fileSize !== undefined && Number(fileSize) > MAX_BYTES) {
      throw new BadRequestException('File exceeds the 5 MB size limit');
    }

    // Must be auth user OR guest with valid token
    if (!userId) {
      await this.validateGuestToken(bookingId, statusToken);
    }
    // ... rest of method unchanged
  ```

- [ ] **Step 3: Update `api.ts` — add `fileSize` param to `getSignedUploadUrl`**

  Replace the `getSignedUploadUrl` function in `lib/api.ts`:
  ```typescript
  getSignedUploadUrl: (fileName: string, bookingId?: string, statusToken?: string, authToken?: string, fileSize?: number) => {
    const params = new URLSearchParams({ fileName });
    if (bookingId) params.set('bookingId', bookingId);
    if (statusToken) params.set('statusToken', statusToken);
    if (fileSize !== undefined) params.set('fileSize', String(fileSize));
    return request<{ signedUrl: string; path: string }>(`/storage/upload-url?${params}`, {
      method: 'POST',
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    });
  },
  ```

- [ ] **Step 4: Pass `file.size` from `PaymentForm.tsx`**

  In `PaymentForm.tsx`, find the `api.getSignedUploadUrl(...)` call (currently 4 arguments) and add the file size as a 5th argument:
  ```typescript
  const { signedUrl, path } = await api.getSignedUploadUrl(
    proofFile!.name.replace(/\s+/g, '_'),
    undefined,
    undefined,
    token || undefined,
    proofFile!.size,
  );
  ```

- [ ] **Step 5: Pass `file.size` from `CheckStatus.tsx`**

  In `CheckStatus.tsx`, find the `api.getSignedUploadUrl(...)` call in `handleReupload` and add the file size as a 5th argument:
  ```typescript
  const { signedUrl, path } = await api.getSignedUploadUrl(
    file.name,
    booking.id,
    guestStatusToken,
    authToken ?? undefined,
    file.size,
  );
  ```

- [ ] **Step 6: Verify TypeScript compiles in both projects**

  ```bash
  cd wash-and-go-backend && npx tsc --noEmit
  cd ../wash-and-go-SE2 && npx tsc --noEmit
  ```
  Expected: no errors in either.

- [ ] **Step 7: Smoke-test the size rejection**

  Start the backend, then:
  ```bash
  curl -si -X POST "http://localhost:3001/api/storage/upload-url?fileName=test.jpg&fileSize=6000000" \
    -H "Content-Type: application/json"
  ```
  Expected: `400 Bad Request` with body `{"message":"File exceeds the 5 MB size limit",...}`

- [ ] **Step 8: Commit**

  ```bash
  git add \
    wash-and-go-backend/src/storage/storage.controller.ts \
    wash-and-go-backend/src/storage/storage.service.ts \
    wash-and-go-SE2/lib/api.ts \
    wash-and-go-SE2/components/PaymentForm.tsx \
    wash-and-go-SE2/components/CheckStatus.tsx
  git commit -m "feat: enforce 5 MB file upload size limit before issuing signed URL"
  ```

---

### Task 6: Backend + Frontend — Honeypot on Booking Creation

**Files:**
- Modify: `wash-and-go-backend/src/bookings/dto/create-booking.dto.ts`
- Modify: `wash-and-go-backend/src/bookings/bookings.service.ts`
- Modify: `wash-and-go-SE2/components/BookingWizard.tsx`

**Interfaces:**
- Produces: Any booking creation request where `honeypot` is a non-empty string receives `400 Invalid booking request`. Real users never set this field; bots that auto-fill hidden inputs do.

- [ ] **Step 1: Add `honeypot` field to `create-booking.dto.ts`**

  Add these two imports at the top if not already present: `IsOptional`, `IsString` (both are already imported — no change needed). Add the field at the end of the `CreateBookingDto` class, before the closing brace:
  ```typescript
  @IsOptional()
  @IsString()
  honeypot?: string;
  ```

  The global `ValidationPipe` has `whitelist: true`, which strips unknown fields. Declaring `honeypot` in the DTO is required so it is NOT stripped and can reach the service layer.

- [ ] **Step 2: Add honeypot check at the top of `create()` in `bookings.service.ts`**

  In `BookingsService.create(dto: CreateBookingDto, userId?: string)`, insert as the very first line of the method body (before the Supabase query):
  ```typescript
  if (dto.honeypot) throw new BadRequestException('Invalid booking request');
  ```

- [ ] **Step 3: Add hidden honeypot input to `BookingWizard.tsx`**

  Find the booking form JSX in `BookingWizard.tsx`. The spec says to add the hidden input inside the booking form. Locate the form element (search for `handleFinalSubmit` or the `<form` tag in the wizard). Add this inside the form, anywhere (it is hidden so position doesn't matter visually):
  ```tsx
  {/* Honeypot — bots fill this, real users don't */}
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

  **Important:** this input is purely for bot detection. Its value is always empty string — never read from state.

- [ ] **Step 4: Add `honeypot: ''` to the booking payload in `BookingWizard.tsx`**

  In `handleFinalSubmit`, find the `api.createBooking({...})` call. Add `honeypot: ''` to the DTO object:
  ```typescript
  const booking = await api.createBooking({
    customerName: customerDetails.name,
    customerPhone: customerDetails.phone,
    customerEmail: customerDetails.email || undefined,
    serviceId: selectedService.id,
    vehicleSize: vehicleSize,
    vehicleType: vehicleType === 'Motorcycle' ? 'MOTORCYCLE' : 'VEHICLE',
    fuelType: fuelType || undefined,
    date: date,
    timeSlot: timeSlot,
    plateNumber: plateNumber || undefined,
    paymentProofPath: customerDetails.proofPath,
    paymentMethod: customerDetails.paymentMethod,
    honeypot: '',
  }, token || undefined);
  ```

- [ ] **Step 5: Verify TypeScript compiles in both projects**

  ```bash
  cd wash-and-go-backend && npx tsc --noEmit
  cd ../wash-and-go-SE2 && npx tsc --noEmit
  ```
  Expected: no errors in either.

- [ ] **Step 6: Smoke-test honeypot rejection**

  ```bash
  curl -si -X POST http://localhost:3001/api/bookings \
    -H "Content-Type: application/json" \
    -d '{"honeypot":"filled","customerName":"Bot","customerPhone":"09123456789","serviceId":"any","vehicleSize":"SMALL","date":"2026-07-01","timeSlot":"9:00 AM"}'
  ```
  Expected: `400 Bad Request`, body contains `"Invalid booking request"`.

- [ ] **Step 7: Verify legitimate booking still works**

  A request with `"honeypot": ""` should fail for other reasons (invalid serviceId) — not honeypot rejection. Confirm the error is about the service, not the honeypot:
  ```bash
  curl -si -X POST http://localhost:3001/api/bookings \
    -H "Content-Type: application/json" \
    -d '{"honeypot":"","customerName":"Test","customerPhone":"09123456789","serviceId":"fake","vehicleSize":"SMALL","date":"2026-07-01","timeSlot":"9:00 AM"}'
  ```
  Expected: `404` or `400` with a message about the service, NOT about honeypot.

- [ ] **Step 8: Commit**

  ```bash
  git add \
    wash-and-go-backend/src/bookings/dto/create-booking.dto.ts \
    wash-and-go-backend/src/bookings/bookings.service.ts \
    wash-and-go-SE2/components/BookingWizard.tsx
  git commit -m "feat: honeypot field on booking creation to block automated submissions"
  ```

---

### Task 7: Backend + Frontend — Status Token Rotation After Reupload

**Files:**
- Modify: `wash-and-go-backend/src/bookings/bookings.service.ts`
- Modify: `wash-and-go-SE2/lib/api.ts`
- Modify: `wash-and-go-SE2/components/CheckStatus.tsx`

**Interfaces:**
- Produces: After a successful `reuploadProof`, the response includes `statusToken: <new_64_char_hex_token>`. The frontend saves the new token so subsequent status lookups continue to work.

- [ ] **Step 1: Add token rotation to `reuploadProof()` in `bookings.service.ts`**

  Find the current end of `reuploadProof()` (around line 417–420):
  ```typescript
  if (error) throw new Error(error.message);

  void this.notifyAdminsPaymentReview(this.toBooking(data));
  return this.toBooking(data);
  ```

  Replace with:
  ```typescript
  if (error) throw new Error(error.message);

  const newPlainToken = randomBytes(32).toString('hex');
  const newTokenHash = createHash('sha256').update(newPlainToken).digest('hex');
  const newExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  await this.supabase
    .getAdminClient()
    .from('bookings')
    .update({ status_token_hash: newTokenHash, status_token_expires_at: newExpiry })
    .eq('id', id.toUpperCase());

  void this.notifyAdminsPaymentReview(this.toBooking(data));
  return { ...this.toBooking(data), statusToken: newPlainToken };
  ```

  `randomBytes` and `createHash` are already imported at the top of this file (they were used during booking creation). No new imports needed.

- [ ] **Step 2: Update `reuploadProof` return type in `api.ts`**

  Find line 110 in `api.ts`:
  ```typescript
  reuploadProof: (id: string, paymentProofPath: string, statusToken: string, authToken?: string) =>
    request<Booking>(`/bookings/${id}/payment-proof`, {
  ```

  Change `request<Booking>` to `request<Booking & { statusToken?: string }>`:
  ```typescript
  reuploadProof: (id: string, paymentProofPath: string, statusToken: string, authToken?: string) =>
    request<Booking & { statusToken?: string }>(`/bookings/${id}/payment-proof`, {
  ```

- [ ] **Step 3: Update `CheckStatus.tsx` — save the rotated token**

  In `GuestLookup` function component, find the `onReuploadSuccess` callback passed to `BookingDetailModal`:
  ```tsx
  onReuploadSuccess={(updated) => { setResult(updated); }}
  ```

  Replace with:
  ```tsx
  onReuploadSuccess={(updated) => {
    setResult(updated);
    if (updated.statusToken) setStatusToken(updated.statusToken);
  }}
  ```

  This works because `updated` is now typed as `Booking & { statusToken?: string }` (flows from the `api.reuploadProof` return type through `handleReupload` → `onReuploadSuccess?.(updated)`).

  Also update the `onReuploadSuccess` prop type in `BookingDetailModalProps` interface (around line 50):
  ```typescript
  onReuploadSuccess?: (updated: Booking & { statusToken?: string }) => void;
  ```

- [ ] **Step 4: Verify TypeScript compiles in both projects**

  ```bash
  cd wash-and-go-backend && npx tsc --noEmit
  cd ../wash-and-go-SE2 && npx tsc --noEmit
  ```
  Expected: no errors in either.

- [ ] **Step 5: Smoke-test token rotation**

  This requires an existing booking in `REUPLOAD_REQUIRED` status. If one exists locally:
  ```bash
  curl -si -X POST http://localhost:3001/api/bookings/BK-XXXXXX/payment-proof \
    -H "Content-Type: application/json" \
    -d '{"paymentProofPath":"proofs/test.jpg","statusToken":"<old_token>"}'
  ```
  Expected: response JSON contains `"statusToken": "<64-char-hex-string>"`.

  If no such booking exists locally, verify correctness by reading the service code — the logic is straightforward and verifiable by inspection.

- [ ] **Step 6: Commit**

  ```bash
  git add \
    wash-and-go-backend/src/bookings/bookings.service.ts \
    wash-and-go-SE2/lib/api.ts \
    wash-and-go-SE2/components/CheckStatus.tsx
  git commit -m "feat: rotate status token after payment proof reupload"
  ```

---

### Task 8: npm Dependency Audit

**Files:**
- Modify: `wash-and-go-backend/package-lock.json` (auto-updated)
- Modify: `wash-and-go-SE2/package-lock.json` (auto-updated)

**Interfaces:**
- Produces: Any auto-fixable vulnerabilities resolved. Audit report of remaining issues documented.

- [ ] **Step 1: Run audit fix on the backend**

  ```bash
  cd wash-and-go-backend && npm audit fix
  ```
  This updates `package-lock.json` with safe, semver-compatible upgrades only.

- [ ] **Step 2: Run audit fix on the frontend**

  ```bash
  cd ../wash-and-go-SE2 && npm audit fix
  ```

- [ ] **Step 3: Run full audit to see what remains**

  ```bash
  cd ../wash-and-go-backend && npm audit
  cd ../wash-and-go-SE2 && npm audit
  ```
  Note any remaining vulnerabilities. If severity is `high` or `critical` and they require `--force` to fix, record them in a comment in this plan — do NOT run `--force`.

- [ ] **Step 4: Verify both projects still build**

  ```bash
  cd wash-and-go-backend && npm run build
  cd ../wash-and-go-SE2 && npm run build
  ```
  Expected: both builds complete with no errors.

- [ ] **Step 5: Commit**

  ```bash
  git add wash-and-go-backend/package-lock.json wash-and-go-SE2/package-lock.json
  # Only add package.json if npm audit fix actually changed it:
  git status
  git commit -m "fix: npm audit fix on backend and frontend dependencies"
  ```

---

## Self-Review Checklist

**Spec coverage:**

| Spec item | Task |
|-----------|------|
| Item 1 — CSP (backend) | Task 1 |
| Item 1 — CSP (frontend `_headers`) | Task 2 |
| Item 2 — Request body size limit | Task 1 |
| Item 3 — Permissions-Policy | Task 1 |
| Item 6 — File upload size enforcement | Task 5 |
| Item 7 — Error response sanitization | Task 3 |
| Item 8 — Auth rate limiting | Task 4 |
| Item 9 — npm audit | Task 8 |
| Item 11 — Honeypot | Task 6 |
| Item 12 — Status token rotation | Task 7 |

All 9 in-scope items are covered. Items 5 and 10 (DB-backed rate limiting, audit log) are deferred per spec.

**Placeholder scan:** No TBDs, no "similar to task N" references. Every code step shows the exact code to write.

**Type consistency:**
- `fileSize` is `string` at the query param boundary (controller) and `number` in the frontend — conversion done via `String(fileSize)` at the call site and `Number(fileSize)` at the service layer.
- `Booking & { statusToken?: string }` is the return type from `api.reuploadProof`, matching what the service returns and what the CheckStatus callback consumes.
- `honeypot?: string` is declared in the DTO and checked as truthy in the service — consistent.
