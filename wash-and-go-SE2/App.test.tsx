import { describe, it, expect } from 'vitest';
import { parseStatusDeepLink, applyPostedUpdate, syncBooking } from './App';
import { BookingStatus, VehicleSize } from './types';
import type { Booking } from './types';

function makeBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'BK-0001',
    customerName: 'Juan Dela Cruz',
    customerPhone: '09123456789',
    serviceId: 'svc-1',
    serviceName: 'Premium Wash',
    vehicleSize: VehicleSize.SMALL,
    date: '2026-08-01',
    timeSlot: '10:00 AM',
    totalPrice: 500,
    downPaymentAmount: 150,
    status: BookingStatus.PENDING_VERIFICATION,
    createdAt: 0,
    ...overrides,
  };
}

describe('parseStatusDeepLink', () => {
  it('redirects and extracts the booking id from a reupload-email deep link', () => {
    expect(parseStatusDeepLink('?view=status&bookingId=BK-000001')).toEqual({
      shouldRedirect: true,
      bookingId: 'BK-000001',
    });
  });

  it('redirects with no booking id when the link omits it', () => {
    expect(parseStatusDeepLink('?view=status')).toEqual({
      shouldRedirect: true,
      bookingId: null,
    });
  });

  it('does not redirect for a normal page load with no query string', () => {
    expect(parseStatusDeepLink('')).toEqual({
      shouldRedirect: false,
      bookingId: null,
    });
  });

  it('does not redirect for an unrelated view value', () => {
    expect(parseStatusDeepLink('?view=services')).toEqual({
      shouldRedirect: false,
      bookingId: null,
    });
  });
});

describe('applyPostedUpdate', () => {
  const newUpdate = { id: 'u1', timestamp: '2026-08-01T00:00:00Z', message: 'Confirmed:' };

  it('appends the update and applies the status when a combined status + note action is posted', () => {
    const bookings = [makeBooking({ id: 'BK-1001', status: BookingStatus.PENDING_VERIFICATION })];
    const result = applyPostedUpdate(bookings, 'BK-1001', newUpdate, BookingStatus.CONFIRMED);
    expect(result[0].status).toBe(BookingStatus.CONFIRMED);
    expect(result[0].updates).toEqual([newUpdate]);
  });

  it('appends the update without touching status when no status is posted (plain note)', () => {
    const bookings = [makeBooking({ id: 'BK-1001', status: BookingStatus.CONFIRMED })];
    const result = applyPostedUpdate(bookings, 'BK-1001', newUpdate);
    expect(result[0].status).toBe(BookingStatus.CONFIRMED);
    expect(result[0].updates).toEqual([newUpdate]);
  });

  it('leaves other bookings in the list untouched', () => {
    const other = makeBooking({ id: 'BK-2002', status: BookingStatus.PENDING });
    const bookings = [makeBooking({ id: 'BK-1001' }), other];
    const result = applyPostedUpdate(bookings, 'BK-1001', newUpdate, BookingStatus.CONFIRMED);
    expect(result[1]).toEqual(other);
  });
});

describe('syncBooking', () => {
  it('merges the synced booking fields into the matching list entry, preserving its update history', () => {
    const existingUpdates = [{ id: 'u1', timestamp: '2026-08-01T00:00:00Z', message: 'Note' }];
    const bookings = [makeBooking({ id: 'BK-1001', status: BookingStatus.PENDING_VERIFICATION, updates: existingUpdates })];
    const result = syncBooking(bookings, makeBooking({ id: 'BK-1001', status: BookingStatus.REUPLOAD_REQUIRED }));
    expect(result[0].status).toBe(BookingStatus.REUPLOAD_REQUIRED);
    expect(result[0].updates).toEqual(existingUpdates);
  });

  it('leaves other bookings in the list untouched', () => {
    const other = makeBooking({ id: 'BK-2002' });
    const bookings = [makeBooking({ id: 'BK-1001' }), other];
    const result = syncBooking(bookings, makeBooking({ id: 'BK-1001', status: BookingStatus.REUPLOAD_REQUIRED }));
    expect(result[1]).toEqual(other);
  });
});
