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

    // ── 2. Find the first available slot in the next 14 days ───────────────────
    let dateStr = '';
    let slot: any = null;
    for (let offset = 1; offset <= 14; offset++) {
      const candidate = new Date();
      candidate.setDate(candidate.getDate() + offset);
      const candidateStr = candidate.toISOString().split('T')[0];
      const availRes = await page.request.get(
        `${API}/bookings/availability?date=${candidateStr}&serviceId=${grooming.id}`,
      );
      if (!availRes.ok()) continue;
      const avail = (await availRes.json()) as any;
      if (avail.closed || !avail.slots?.length) continue;
      slot = (avail.slots as any[]).find((s: any) => s.available) ?? null;
      if (slot) { dateStr = candidateStr; break; }
    }
    if (!dateStr || !slot) {
      test.skip(true, 'No available GROOMING slots in the next 14 days — clear test data and retry');
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
    const booking = (await createRes.json()) as any;
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

    // ── 6–8. Browser: navigate to Guest Lookup and enter Booking ID ─────────────
    await page.goto('/');
    await page.getByRole('navigation').getByRole('button', { name: /CHECK STATUS/i }).click();
    await expect(page.getByText('Guest Booking Lookup')).toBeVisible({ timeout: 10_000 });

    await page.getByPlaceholder('BK-123456').fill(bookingId);

    // ── 9. Submit the lookup form ───────────────────────────────────────────────
    await page.getByRole('button', { name: 'Check Status', exact: true }).click();

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

    // ── 12–14. Success popup appears with "Proof Resubmitted" status ────────────
    // Note: after upload the booking detail modal closes and a "Proof Submitted!"
    // success popup appears containing the updated status text. The popup covers
    // the full screen (z-50), so we verify status directly from it rather than
    // re-submitting the lookup form.
    await expect(page.getByText('Proof Submitted!')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Proof Resubmitted')).toBeVisible();
  });
});
