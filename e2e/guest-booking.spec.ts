import { test, expect } from '@playwright/test';

const API = process.env.VITE_API_URL ?? 'http://localhost:3001/api';

/**
 * Tests customer booking with payment proof upload.
 * Requires a non-admin Supabase user account set via PLAYWRIGHT_USER_EMAIL
 * and PLAYWRIGHT_USER_PASSWORD in the root .env file.
 *
 * Admin accounts auto-redirect to the admin dashboard and don't exercise the
 * full payment-proof flow, so a separate regular user account is needed here.
 */
test.describe('Customer booking with payment proof', () => {
  test('logged-in user completes booking wizard with proof upload', async ({ page }) => {
    const userEmail = process.env.PLAYWRIGHT_USER_EMAIL;
    const userPassword = process.env.PLAYWRIGHT_USER_PASSWORD;
    if (!userEmail || !userPassword) {
      test.skip(true, 'Set PLAYWRIGHT_USER_EMAIL and PLAYWRIGHT_USER_PASSWORD in .env to run this test');
      return;
    }

    // ── Pre-check: find a date with available GROOMING slots ────────────────────
    const servicesRes = await page.request.get(`${API}/services`);
    expect(servicesRes.ok()).toBeTruthy();
    const services = (await servicesRes.json()) as any[];
    const grooming = services.find((s: any) => (s.category as string).toUpperCase() === 'GROOMING') ?? services[0];

    let dateStr = '';
    let slotTime = '';
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
      const slot = (avail.slots as any[]).find((s: any) => s.available);
      if (slot) { dateStr = candidateStr; slotTime = slot.time; break; }
    }
    if (!dateStr) {
      test.skip(true, 'No available GROOMING slots in the next 14 days — clear test data and retry');
      return;
    }

    await page.goto('/');

    // Login as regular (non-admin) user (desktop nav button — mobile drawer has a duplicate)
    await page.getByRole('button', { name: /login \/ sign up/i }).first().click();
    await page.getByPlaceholder('juan@email.com').fill(userEmail);
    await page.getByPlaceholder('********').fill(userPassword);
    await page.getByRole('button', { name: 'SIGN IN' }).click();
    // Wait for "My Profile" label inside <main> — only renders inside UserProfile (PROFILE view)
    // Extended timeout: Supabase auth can be slow on first sign-in
    await expect(page.locator('main').getByText('My Profile')).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(800); // let profile view settle before navigating away

    // Navigate to booking wizard via nav BOOK NOW button
    await page.getByRole('navigation').getByRole('button', { name: 'BOOK NOW' }).click();
    await expect(page.getByText('Select Your Vehicle')).toBeVisible({ timeout: 10_000 });

    // Step 1: VehicleSelection — Car, Small
    await page.getByText('Car / SUV / Van').click();
    await page.getByRole('button', { name: /^small/i }).first().click();
    await page.getByRole('button', { name: /Next: Select Service/i }).click();

    // Step 2: ServiceSelection — GROOMING (no fuel type step)
    await page.getByRole('button', { name: /grooming/i }).first().click();
    await page.getByRole('button', { name: /select package/i }).first().click();

    // Step 4: ScheduleSelection — use API-verified available date
    await page.locator('input[type="date"]').fill(dateStr);
    await page.waitForTimeout(2000);
    await page.getByRole('button', { name: slotTime }).click();
    await page.getByPlaceholder(/e\.g\. ABC 1234/i).fill('ABC 1234');
    await page.getByRole('button', { name: 'PROCEED' }).click();

    // Step 5: PaymentForm — customer mode requires payment proof
    await page.getByPlaceholder('Juan Dela Cruz').fill('Test Customer');
    await page.getByPlaceholder('09XXXXXXXXX').fill('09123456789');

    // Upload a minimal valid PNG as payment proof
    await page.locator('input[type="file"]').setInputFiles({
      name: 'proof.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64',
      ),
    });

    // Handle the success dialog and submit
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'COMPLETE BOOKING' }).click();

    // After dialog dismissed, app redirects to HOME
    await expect(page.getByRole('navigation').getByRole('button', { name: 'BOOK NOW' })).toBeVisible({ timeout: 15_000 });
  });
});
