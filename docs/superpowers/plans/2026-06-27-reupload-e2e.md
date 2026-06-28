# Payment Proof Reupload E2E Test Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `e2e/reupload.spec.ts` as a fully self-contained Playwright test that creates its own data, declines payment via API as admin, then exercises the guest reupload UI end-to-end — no manual env var seeding required beyond the standard `PLAYWRIGHT_ADMIN_EMAIL` / `PLAYWRIGHT_ADMIN_PASSWORD` already in root `.env`.

**Architecture:** The test sets up its own state via HTTP calls before touching the browser: (1) create a `PENDING_VERIFICATION` booking via the public API; (2) obtain an admin JWT by calling the Supabase Auth REST endpoint directly; (3) decline the booking via the backend admin endpoint to reach `REUPLOAD_REQUIRED`. Then it drives the browser through the guest lookup form (`CHECK STATUS → Guest Lookup`) and the reupload modal, and verifies the status changes to `Proof Resubmitted`.

**Tech Stack:** Playwright `page.request`, Supabase Auth REST (`POST /auth/v1/token?grant_type=password`), backend API (`POST /api/bookings`, `POST /api/bookings/:id/payment/decline`).

## Global Constraints

- **No git commits** — user commits manually; never run `git add` or `git commit`
- Test must skip gracefully (not fail) when `PLAYWRIGHT_ADMIN_EMAIL` or `PLAYWRIGHT_ADMIN_PASSWORD` is absent
- `workers: 1` and `timeout: 60_000` are already set in `playwright.config.ts` — do not change them
- The Supabase URL and anon key (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) are available in root `.env` — already loaded by `playwright.config.ts` via `dotenv.config()`
- The admin account used in this test must have `profiles.role = 'admin'` in Supabase — the same account that already has `PLAYWRIGHT_ADMIN_EMAIL` / `PLAYWRIGHT_ADMIN_PASSWORD` works
- Never hard-code credentials; always read from `process.env`
- The `declinePayment` backend endpoint requires the caller to be admin — it calls `requireAdmin(requestingUserId)` internally; passing a non-admin JWT will produce a 403

---

### Task 1: Rewrite `e2e/reupload.spec.ts` as a self-contained test

**Files:**
- Modify (full rewrite): `e2e/reupload.spec.ts`

**How the current file is broken:**
- Uses `POST /auth/request-password-reset` to authenticate — that endpoint sends a password reset email; it does not return a JWT
- Requires `TEST_REUPLOAD_BOOKING_ID` and `TEST_REUPLOAD_STATUS_TOKEN` to be set manually in `.env`
- Uses `page.getByRole('link', ...)` — the nav uses `<button>` elements, not links

**Flow the new test implements:**

```
API (no browser):
  1. GET /api/services → pick a GROOMING service
  2. GET /api/bookings/availability?date=<next-Monday>&serviceId=<id> → pick first available slot
  3. POST /api/bookings { paymentProofPath: 'e2e/test-proof.png', ... } → booking.id, booking.statusToken
  4. POST <SUPABASE_URL>/auth/v1/token?grant_type=password { email, password } → access_token (adminToken)
  5. POST /api/bookings/<id>/payment/decline { declineReason: 'E2E test decline' } with Authorization: Bearer <adminToken>

Browser:
  6. page.goto('/')
  7. Click "MY BOOKINGS" nav button
  8. The guest tab is auto-selected when not logged in; fill Booking ID (from step 3) — no token required; guest lookup is by Booking ID only
  9. Click "Check Status"
  10. Booking detail modal opens — verify "Re-upload Required" status
  11. Set file on hidden file input → click "Submit New Proof"
  12. Modal closes automatically on success
  13. Click "Check Status" again (form still has new token set by onReuploadSuccess)
  14. Verify "Proof Resubmitted" status text appears (REUPLOAD_SUBMITTED)
```

- [ ] **Step 1: Write the new `e2e/reupload.spec.ts`**

Replace the entire file with:

```typescript
import { test, expect } from '@playwright/test';

const API = process.env.VITE_API_URL ?? 'http://localhost:3001/api';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? '';

test.describe('Payment proof reupload flow', () => {
  test('guest can reupload proof after admin declines, status becomes Proof Resubmitted', async ({ page }) => {
    const adminEmail = process.env.PLAYWRIGHT_ADMIN_EMAIL;
    const adminPassword = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
    if (!adminEmail || !adminPassword) {
      test.skip(true, 'Set PLAYWRIGHT_ADMIN_EMAIL and PLAYWRIGHT_ADMIN_PASSWORD in .env');
      return;
    }

    // ── 1. Pick a GROOMING service ──────────────────────────────────────────────
    const servicesRes = await page.request.get(`${API}/services`);
    expect(servicesRes.ok()).toBeTruthy();
    const services = (await servicesRes.json()) as any[];
    const grooming = services.find((s: any) => (s.category as string).toUpperCase() === 'GROOMING') ?? services[0];

    // ── 2. Find an available slot (next Monday) ─────────────────────────────────
    const today = new Date();
    const daysUntilMonday = ((8 - today.getDay()) % 7) || 7;
    const nextMonday = new Date(today);
    nextMonday.setDate(today.getDate() + daysUntilMonday);
    const dateStr = nextMonday.toISOString().split('T')[0];

    const availRes = await page.request.get(
      `${API}/bookings/availability?date=${dateStr}&serviceId=${grooming.id}`,
    );
    expect(availRes.ok()).toBeTruthy();
    const avail = await availRes.json() as any;
    if (avail.closed || !avail.slots?.length) {
      test.skip(true, `Shop closed or no slots on ${dateStr}`);
      return;
    }
    const slot = (avail.slots as any[]).find((s: any) => s.available);
    if (!slot) {
      test.skip(true, `All slots fully booked on ${dateStr}`);
      return;
    }

    // ── 3. Create a PENDING_VERIFICATION booking as guest ──────────────────────
    const createRes = await page.request.post(`${API}/bookings`, {
      data: {
        customerName: 'E2E Reupload Test',
        customerPhone: '09000000001',
        customerEmail: 'e2e-reupload@example.com',
        serviceId: grooming.id,
        vehicleSize: 'SMALL',
        vehicleType: 'VEHICLE',
        date: dateStr,
        timeSlot: slot.time,
        plateNumber: 'RUP001',
        paymentProofPath: 'e2e/test-proof.png',
        paymentMethod: 'gcash',
        honeypot: '',
      },
    });
    expect(createRes.ok()).toBeTruthy();
    const booking = await createRes.json() as any;
    expect(booking.id).toMatch(/^BK-/);
    const bookingId: string = booking.id;

    // ── 4. Get admin JWT from Supabase Auth REST ────────────────────────────────
    const signInRes = await page.request.post(
      `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        data: { email: adminEmail, password: adminPassword },
      },
    );
    expect(signInRes.ok()).toBeTruthy();
    const { access_token: adminToken } = (await signInRes.json()) as { access_token: string };
    expect(adminToken).toBeTruthy();

    // ── 5. Admin declines the booking → REUPLOAD_REQUIRED ──────────────────────
    const declineRes = await page.request.post(`${API}/bookings/${bookingId}/payment/decline`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      data: { declineReason: 'E2E test decline — proof unclear' },
    });
    expect(declineRes.ok()).toBeTruthy();

    // ── 6–8. Browser: navigate to Guest Lookup and enter credentials ────────────
    await page.goto('/');
    await page.getByRole('navigation').getByRole('button', { name: /CHECK STATUS/i }).click();
    await expect(page.getByText('Guest Booking Lookup')).toBeVisible({ timeout: 10_000 });

    await page.getByPlaceholder('BK-123456').fill(bookingId);

    // ── 9. Submit the lookup form ───────────────────────────────────────────────
    await page.getByRole('button', { name: 'Check Status' }).click();

    // ── 10. Booking detail modal opens — verify REUPLOAD_REQUIRED ──────────────
    await expect(page.getByText('Re-upload Required')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Upload New Payment Proof')).toBeVisible();

    // ── 11. Upload a new proof image (minimal 1×1 PNG) ─────────────────────────
    await page.locator('input[type="file"]').setInputFiles({
      name: 'new-proof.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64',
      ),
    });
    await page.getByRole('button', { name: /Submit New Proof/i }).click();

    // ── 12–13. Modal closes on success; re-check booking status ─────────────────
    await expect(page.getByText('Booking Details')).not.toBeVisible({ timeout: 20_000 });

    // Re-submit the lookup (Booking ID unchanged) to verify the status updated.
    await page.getByRole('button', { name: 'Check Status' }).click();

    // ── 14. Verify final status is Proof Resubmitted (REUPLOAD_SUBMITTED) ────────
    await expect(page.getByText('Proof Resubmitted')).toBeVisible({ timeout: 10_000 });
  });
});
```

- [ ] **Step 2: Run the test in isolation to verify it passes**

Ensure both servers are running (or they start via `webServer` in playwright config), then:
```bash
npx playwright test e2e/reupload.spec.ts --reporter=list
```

Expected output (approximate):
```
  ✓  Payment proof reupload flow › guest can reupload proof ... (35s)

  1 passed (36s)
```

If `PLAYWRIGHT_ADMIN_EMAIL` is not set, the test skips cleanly:
```
  -  Payment proof reupload flow › ... — skipped
```

- [ ] **Step 3: Run the full E2E suite to check for regressions**

```bash
npx playwright test --reporter=list
```

Expected: all previously passing tests still pass; reupload test passes (or skips if no admin creds). No test should fail that was passing before.

**Common failure modes and fixes:**

| Symptom | Likely cause | Fix |
|---|---|---|
| Step 4 returns 400/401 | Wrong Supabase URL or anon key | Check `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in root `.env` |
| Step 5 returns 403 | Admin account doesn't have `role = 'admin'` in `profiles` table | Set `profiles.role = 'admin'` for `PLAYWRIGHT_ADMIN_EMAIL` account in Supabase |
| Step 10: "Re-upload Required" not visible | Slot unavailable — test already skips at step 2 | No action needed |
| Step 12: modal stays open >20s | File upload to Supabase Storage timed out | Check backend logs; retry once |
| Step 14: "Proof Resubmitted" not visible | Status update did not persist or wrong label | Verify `REUPLOAD_SUBMITTED` is in `SLOT_CHECK_STATUSES` in `bookings.service.ts`; check `getStatusMeta` in `CheckStatus.tsx` maps `REUPLOAD_SUBMITTED` → label `'Proof Resubmitted'` |
