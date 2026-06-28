import { test, expect } from '@playwright/test';

const API = process.env.VITE_API_URL ?? 'http://localhost:3001/api';

test.describe('Admin walk-in booking', () => {
  test('admin creates walk-in booking via booking wizard, no payment proof required', async ({ page }) => {
    const adminEmail = process.env.PLAYWRIGHT_ADMIN_EMAIL;
    const adminPassword = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
    if (!adminEmail || !adminPassword) {
      test.skip(true, 'Set PLAYWRIGHT_ADMIN_EMAIL and PLAYWRIGHT_ADMIN_PASSWORD in .env');
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

    // Login as admin (desktop nav button — mobile drawer has a duplicate)
    await page.getByRole('button', { name: /login \/ sign up/i }).first().click();
    await page.getByPlaceholder('juan@email.com').fill(adminEmail);
    await page.getByPlaceholder('********').fill(adminPassword);
    await page.getByRole('button', { name: 'SIGN IN' }).click();
    await expect(page.getByRole('heading', { name: 'Admin Dashboard' })).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(800); // let dashboard fully settle before navigating away

    // Navigate to booking wizard via BOOK NOW in nav (admin isWalkIn=true via isStaff)
    await page.getByRole('navigation').getByRole('button', { name: 'BOOK NOW' }).click();
    await expect(page.getByText('Select Your Vehicle')).toBeVisible({ timeout: 10_000 });

    // Step 1: VehicleSelection — Car, Small
    await page.getByText('Car / SUV / Van').click();
    await page.getByRole('button', { name: /^small/i }).first().click();
    await page.getByRole('button', { name: /Next: Select Service/i }).click();

    // Step 2: ServiceSelection — GROOMING category (skips fuel type step)
    await page.getByRole('button', { name: /grooming/i }).first().click();
    await page.getByRole('button', { name: /select package/i }).first().click();

    // Step 4: ScheduleSelection — use API-verified available date
    await page.locator('input[type="date"]').fill(dateStr);
    await page.waitForTimeout(2000);
    await page.getByRole('button', { name: slotTime }).click();
    await page.getByPlaceholder(/e\.g\. ABC 1234/i).fill('WLK 0001');
    await page.getByRole('button', { name: 'PROCEED' }).click();

    // Step 5: PaymentForm in walk-in mode — no proof file required
    await expect(page.getByRole('heading', { name: 'WALK-IN BOOKING' })).toBeVisible({ timeout: 5_000 });
    await page.getByPlaceholder('Juan Dela Cruz').fill('Walk-In Customer');
    await page.getByPlaceholder('09XXXXXXXXX').fill('09198765432');

    // Handle the success dialog and submit
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'CONFIRM WALK-IN' }).click();

    // After dialog dismissed, app redirects to HOME
    await expect(page.getByRole('navigation').getByRole('button', { name: 'BOOK NOW' })).toBeVisible({ timeout: 15_000 });

    // Navigate to admin panel and verify the new booking appears
    await page.getByRole('button', { name: /admin panel/i }).first().click();
    await expect(page.getByText('WLK 0001').first()).toBeVisible({ timeout: 10_000 });
  });
});
