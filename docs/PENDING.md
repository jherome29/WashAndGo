# Pending Work — Pick Up Here

This file tracks everything that was discussed but not yet implemented, organized so you can resume without re-reading the full conversation.

---

## 1. Finish the Security Spec (do this first when you wake up)

The spec is at [`docs/superpowers/specs/2026-06-27-security-hardening-design.md`](superpowers/specs/2026-06-27-security-hardening-design.md).

It covers 9 items: CSP, body size limit, Permissions-Policy, file upload size enforcement, error sanitization, auth rate limiting, npm audit, honeypot on booking creation, and status token rotation.

**What's left:** implementation. The brainstorming skill finished the design phase. When you're ready to implement, resume by invoking the `writing-plans` skill, then proceed with implementation.

---

## 2. Deferred Security Items (need Supabase tables first)

### Item 5 — DB-Backed Password Reset Rate Limiting

**Why deferred:** the current implementation uses an in-memory `Map` in `AuthService` that resets every time Railway restarts. A DB-backed approach survives restarts.

**Step 1 — run this SQL in your Supabase dashboard:**
```sql
create table password_reset_attempts (
  id uuid primary key default gen_random_uuid(),
  ip_key text not null,
  attempted_at timestamptz not null default now()
);

create index idx_pra_ip_time on password_reset_attempts (ip_key, attempted_at);

-- Auto-delete records older than 24 hours (optional, keeps table small)
-- You can set this up as a pg_cron job in Supabase or just let it grow and purge manually
```

**Step 2 — replace the in-memory tracker in `wash-and-go-backend/src/auth/auth.service.ts`:**

Remove these lines:
```typescript
private readonly resetWindowMs = 60_000;
private readonly resetMaxRequestsPerWindow = 3;
private readonly resetRequestTracker = new Map<string, number[]>();
```

Replace `isPasswordResetRateLimited()` with a Supabase query:
```typescript
private async isPasswordResetRateLimited(ipKey: string): Promise<boolean> {
  const windowStart = new Date(Date.now() - 60_000).toISOString();

  const { count } = await this.supabase
    .getAdminClient()
    .from('password_reset_attempts')
    .select('*', { count: 'exact', head: true })
    .eq('ip_key', ipKey)
    .gte('attempted_at', windowStart);

  if ((count ?? 0) >= 3) return true;

  await this.supabase
    .getAdminClient()
    .from('password_reset_attempts')
    .insert({ ip_key: ipKey });

  return false;
}
```

Also make `requestPasswordReset` call the async version:
```typescript
if (await this.isPasswordResetRateLimited(ipKey)) { ... }
```

---

### Item 10 — Admin Audit Log

**Why deferred:** needs a new Supabase table to store admin actions (who changed what, when).

**Step 1 — run this SQL in your Supabase dashboard:**
```sql
create table admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id),
  action text not null,        -- e.g. 'CONFIRM_PAYMENT', 'DECLINE_PAYMENT', 'UPDATE_STATUS', 'EDIT_BOOKING', 'EDIT_SERVICE_PRICE', 'ADD_PROGRESS_UPDATE'
  target_id text not null,     -- booking ID or service ID
  details jsonb,               -- before/after values or extra context
  created_at timestamptz not null default now()
);

create index idx_aal_admin on admin_audit_logs (admin_user_id, created_at desc);
create index idx_aal_target on admin_audit_logs (target_id, created_at desc);
```

**Step 2 — create `wash-and-go-backend/src/audit/audit-log.service.ts`:**
```typescript
import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class AuditLogService {
  constructor(private supabase: SupabaseService) {}

  async log(adminUserId: string, action: string, targetId: string, details?: Record<string, any>) {
    // Fire-and-forget — audit log failure must never block the main operation
    void this.supabase.getAdminClient()
      .from('admin_audit_logs')
      .insert({ admin_user_id: adminUserId, action, target_id: targetId, details: details ?? null });
  }
}
```

**Step 3 — wire into these methods in `BookingsService` and `ServicesService`:**

| Method | Action string | Details to log |
|--------|---------------|----------------|
| `confirmPayment` | `CONFIRM_PAYMENT` | `{ bookingId }` |
| `declinePayment` | `DECLINE_PAYMENT` | `{ bookingId, declineReason }` |
| `updateStatus` | `UPDATE_STATUS` | `{ bookingId, newStatus }` |
| `adminUpdate` | `EDIT_BOOKING` | `{ bookingId, updatedFields }` |
| `addUpdate` | `ADD_PROGRESS_UPDATE` | `{ bookingId, message }` |
| `ServicesService.update` | `EDIT_SERVICE_PRICE` | `{ serviceId, changes }` |

Example call pattern (all fire-and-forget):
```typescript
void this.auditLog.log(requestingUserId, 'CONFIRM_PAYMENT', id, { bookingId: id });
```

---

## 3. DB-Dependent Tests — Status

**Network fix applied (2026-06-27):** Added `cross-env NODE_OPTIONS=--use-system-ca` to all backend `start:dev`/`start:prod` scripts so Node.js uses the Windows certificate store. Supabase is now reachable locally.

### Completed ✅

**1. stripHtml — verified**
- Sent `customerName: "<script>alert(1)</script>John"` to `POST /api/bookings`
- Response returned `"customerName": "alert(1)John"` — script tags stripped, text content preserved
- Result: ✅ XSS via script injection is blocked

**2. SHA256 token hashing — verified**
- Created booking BK-715921; response included `statusToken` (64-char hex = 32 random bytes)
- Called `POST /api/bookings/status` with that plaintext token — returned the booking successfully
- Confirms: DB stores SHA256 hash of token, plaintext is never persisted
- Result: ✅ Token stored as hash only

**3. RLS — verified**
- Called Supabase REST API directly with anon key: `GET /rest/v1/bookings?select=id,customer_name&limit=5`
- Response: `[]` — 0 rows returned despite bookings existing in DB
- Result: ✅ RLS blocks all direct table access via anon key

**4. Signed URL expiry — verified via code**
- `StorageService.getSignedViewUrl()` calls `createSignedUrl(path, 60 * 60)` — 3600 seconds = 1 hour
- Result: ✅ Expiry confirmed in code at `storage.service.ts:67`

**5. Vuln 2 fix — paymentProofPath validation — verified**
- `POST /api/bookings/BK-715921/payment-proof` with `paymentProofPath: "qr/stolen.png"` → 400 "Invalid payment proof path" ✅
- Same with `paymentProofPath: "proofs/../qr/stolen.png"` (path traversal) → 400 ✅
- Valid path `proofs/real-proof.jpg` → passes validation, reaches DB check (different 400: "Can only reupload proof for REUPLOAD_REQUIRED bookings") — confirms ordering is correct ✅
- Result: ✅ Path validation fires before any DB query

**6. Vuln 4 fix — filename validation — verified**
- `POST /api/storage/upload-url?fileName=malware.exe` with Bearer token → 400 "Only image files are allowed (jpg, jpeg, png, webp)" ✅
- `POST /api/storage/upload-url?fileName=shell.php` → 400 ✅
- Result: ✅ Non-image uploads blocked before any Supabase call

**7. Vuln 5 fix — price DTO — verified**
- `PATCH /api/services/grooming-interior` with `{ "price_small": -500 }` → 400 "price_small must not be less than 0" ✅
- `PATCH /api/services/grooming-interior` with `{ "is_admin": true, "price_small": 100 }` → 400 "property is_admin should not exist" ✅ (whitelist)
- Valid price, non-admin account → 403 "Admin access required" ✅ (validation passes, admin check fires correctly)
- Result: ✅ DTO validation and admin guard both enforced

---

## 4. Code Quality Tools (do this after the security spec is fully implemented)

These were discussed earlier. The frontend has **no linter or test runner at all**. The backend has Jest installed but no tests written.

### Priority Order

#### 1. ESLint for Frontend

The frontend currently uses TypeScript errors as the only quality gate.

```bash
cd wash-and-go-SE2
npm install -D eslint @eslint/js eslint-plugin-react-hooks eslint-plugin-react-refresh typescript-eslint
```

Create `wash-and-go-SE2/eslint.config.js`:
```javascript
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-explicit-any': 'off', // too many `any` in current codebase
    },
  },
);
```

Add to `wash-and-go-SE2/package.json`:
```json
"scripts": {
  "lint": "eslint ."
}
```

---

#### 2. Backend Unit Tests (Jest — already installed)

Start with the pure functions that are highest impact and easiest to test:

**`stripHtml()` in `bookings.service.ts`:**
```typescript
// wash-and-go-backend/src/bookings/bookings.service.spec.ts
describe('stripHtml', () => {
  it('removes script tags', () => {
    expect(stripHtml('<script>alert(1)</script>John')).toBe('John');
  });
  it('removes nested tags', () => {
    expect(stripHtml('<b><i>bold</i></b>')).toBe('bold');
  });
  it('passes plain text unchanged', () => {
    expect(stripHtml('Maria Santos')).toBe('Maria Santos');
  });
});
```

**Slot availability logic:**
```typescript
describe('slotFitsBeforeClose', () => {
  it('allows slot with enough time before close', () => { ... });
  it('rejects slot that would run past close time', () => { ... });
});
```

**Manila timezone booking status (frontend):**
```typescript
// wash-and-go-SE2/src/lib/bookingStatus.test.ts (with Vitest)
describe('isPastBooking', () => {
  it('returns true for COMPLETED bookings', () => { ... });
  it('returns false for CONFIRMED future bookings', () => { ... });
});
```

---

#### 3. Vitest for Frontend

Vitest uses the same Vite config — zero extra configuration needed.

```bash
cd wash-and-go-SE2
npm install -D vitest @testing-library/react @testing-library/user-event jsdom
```

Add to `wash-and-go-SE2/vite.config.ts`:
```typescript
test: {
  environment: 'jsdom',
  globals: true,
}
```

Add to `wash-and-go-SE2/package.json`:
```json
"scripts": {
  "test": "vitest"
}
```

---

#### 4. Playwright E2E Tests

Install at the repo root (tests both frontend and backend together):

```bash
npm install -D @playwright/test
npx playwright install chromium
```

Create `playwright.config.ts` at repo root:
```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:3000',
  },
  webServer: [
    { command: 'cd wash-and-go-backend && npm run start:dev', url: 'http://localhost:3001/api/health', reuseExistingServer: true },
    { command: 'cd wash-and-go-SE2 && npm run dev', url: 'http://localhost:3000', reuseExistingServer: true },
  ],
});
```

**Key flows to test first (highest value):**

| Test file | Flow |
|-----------|------|
| `e2e/guest-booking.spec.ts` | Guest books → receives token → checks status via token |
| `e2e/reupload.spec.ts` | Guest with REUPLOAD_REQUIRED → uploads new proof → token rotates |
| `e2e/admin-payment.spec.ts` | Admin logs in → confirms payment → booking moves to CONFIRMED |
| `e2e/walk-in.spec.ts` | Admin creates walk-in → auto-CONFIRMED without payment |

---

#### 5. CI/CD (GitHub Actions)

Create `.github/workflows/ci.yml` at repo root:
```yaml
name: CI
on: [pull_request, push]

jobs:
  backend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: wash-and-go-backend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'npm', cache-dependency-path: 'wash-and-go-backend/package-lock.json' }
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run build

  frontend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: wash-and-go-SE2
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'npm', cache-dependency-path: 'wash-and-go-SE2/package-lock.json' }
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run build
```

Start with just lint + build (no tests yet). Add `npm test` to CI only after unit tests exist — a CI step that always passes provides no value.

---

## 5. Recommended Order for the Week

```
Today (spec is done, waiting for morning):
  └─ Security spec approved ─▶ writing-plans ─▶ implement 9 items

Tomorrow morning (when you wake up):
  1. Resume security spec → invoke writing-plans → implement all 9 items
  2. Run npm audit fix (safe only, part of item 9)
  3. Build + verify both projects pass

After security is shipped:
  4. Run deferred DB tests (use hotspot or test on production after deploy)
  5. Add ESLint to frontend
  6. Write first backend unit tests (stripHtml, slot logic)
  7. Add Vitest to frontend
  8. Playwright E2E for the 4 key flows
  9. Set up GitHub Actions CI
  10. Create Supabase tables → implement Item 5 (password reset) + Item 10 (audit log)
```
