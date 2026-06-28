import { test, expect } from '@playwright/test';

test.describe('Admin payment confirmation', () => {
  test('admin can confirm a pending payment and booking moves to CONFIRMED', async ({ page }) => {
    const adminEmail = process.env.PLAYWRIGHT_ADMIN_EMAIL;
    const adminPassword = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
    if (!adminEmail || !adminPassword) {
      test.skip(true, 'Set PLAYWRIGHT_ADMIN_EMAIL and PLAYWRIGHT_ADMIN_PASSWORD in .env');
      return;
    }

    const apiUrl = process.env.VITE_API_URL || 'http://localhost:3001/api';

    // Fetch a GROOMING service (2-slot capacity reduces collision risk)
    const servicesRes = await page.request.get(`${apiUrl}/services`);
    expect(servicesRes.ok()).toBeTruthy();
    const services = (await servicesRes.json()) as any[];
    const grooming = services.find((s: any) => (s.category as string).toUpperCase() === 'GROOMING') || services[0];

    // Find the first available slot in the next 14 days
    let dateStr = '';
    let slot: any = null;
    for (let offset = 1; offset <= 14; offset++) {
      const candidate = new Date();
      candidate.setDate(candidate.getDate() + offset);
      const candidateStr = candidate.toISOString().split('T')[0];
      const availRes = await page.request.get(
        `${apiUrl}/bookings/availability?date=${candidateStr}&serviceId=${grooming.id}`,
      );
      if (!availRes.ok()) continue;
      const avail = await availRes.json() as any;
      if (avail.closed || !avail.slots?.length) continue;
      slot = avail.slots.find((s: any) => s.available) ?? null;
      if (slot) { dateStr = candidateStr; break; }
    }
    if (!dateStr || !slot) {
      test.skip(true, 'No available GROOMING slots in the next 14 days — clear test data and retry');
      return;
    }

    // Create a PENDING_VERIFICATION booking as a guest (paymentProofPath → PENDING_VERIFICATION)
    const createRes = await page.request.post(`${apiUrl}/bookings`, {
      data: {
        customerName: 'E2E Payment Test',
        customerPhone: '09123456789',
        customerEmail: 'e2epayment@example.com',
        serviceId: grooming.id,
        vehicleSize: 'SMALL',
        vehicleType: 'VEHICLE',
        date: dateStr,
        timeSlot: slot.time,
        plateNumber: 'E2EPAY01',
        paymentProofPath: 'e2e/test-proof.png',
        paymentMethod: 'gcash',
        honeypot: '',
      },
    });
    expect(createRes.ok()).toBeTruthy();
    const booking = await createRes.json() as any;
    expect(booking.id).toMatch(/^BK-/);

    // Login as admin
    await page.goto('/');
    await page.getByRole('button', { name: /login \/ sign up/i }).first().click();
    await page.getByPlaceholder('juan@email.com').fill(adminEmail);
    await page.getByPlaceholder('********').fill(adminPassword);
    await page.getByRole('button', { name: 'SIGN IN' }).click();
    await expect(page.getByRole('heading', { name: 'Admin Dashboard' })).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(800);

    // Search by booking ID to isolate this test's booking
    await page.getByPlaceholder(/Search by ID/i).fill(booking.id);
    await page.waitForTimeout(500);

    // Click Manage on the matching row
    const manageBtn = page.getByRole('button', { name: /manage/i }).first();
    await manageBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await manageBtn.click();

    // The booking detail modal opens — wait for "Managing Booking" header
    await expect(page.getByText('Managing Booking').first()).toBeVisible({ timeout: 5_000 });

    // Click "Confirmed" in the Update Status section to approve the payment
    await page.getByRole('button', { name: 'Confirmed' }).click();

    // Booking status should now show Confirmed in the modal header or body
    await expect(page.getByText('Confirmed').first()).toBeVisible({ timeout: 10_000 });
  });
});
