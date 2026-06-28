import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isPastBooking, isActiveBooking } from './bookingStatus';
import type { Booking } from '../types';
import { BookingStatus, VehicleSize } from '../types';

function makeBooking(overrides: Partial<Booking>): Booking {
  return {
    id: 'BK-TEST01',
    customerName: 'Test User',
    customerPhone: '09123456789',
    serviceId: 'svc-1',
    serviceName: 'Test Service',
    vehicleSize: VehicleSize.SMALL,
    date: '2030-01-01',
    timeSlot: '10:00 AM',
    totalPrice: 1000,
    downPaymentAmount: 300,
    status: BookingStatus.PENDING,
    createdAt: 0,
    ...overrides,
  };
}

// Freeze time to 2025-06-01 10:00 AM Manila time (UTC+8 = 2025-06-01T02:00:00Z)
const FROZEN_TIME = new Date('2025-06-01T02:00:00.000Z');

describe('isPastBooking', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_TIME);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns true for COMPLETED status regardless of date', () => {
    expect(isPastBooking(makeBooking({ status: BookingStatus.COMPLETED, date: '2030-01-01' }))).toBe(true);
  });

  it('returns true for CANCELLED status regardless of date', () => {
    expect(isPastBooking(makeBooking({ status: BookingStatus.CANCELLED, date: '2030-01-01' }))).toBe(true);
  });

  it('returns true for PENDING booking with a past date', () => {
    expect(isPastBooking(makeBooking({ status: BookingStatus.PENDING, date: '2024-01-01' }))).toBe(true);
  });

  it('returns false for CONFIRMED booking with a future date', () => {
    expect(isPastBooking(makeBooking({ status: BookingStatus.CONFIRMED, date: '2030-01-01' }))).toBe(false);
  });

  it('returns false for IN_PROGRESS even when date is in the past', () => {
    // IN_PROGRESS bookings are excluded from "past" — they are still being worked on
    expect(isPastBooking(makeBooking({ status: BookingStatus.IN_PROGRESS, date: '2024-01-01' }))).toBe(false);
  });

  it('returns true for REUPLOAD_REQUIRED booking with past date', () => {
    expect(isPastBooking(makeBooking({ status: BookingStatus.REUPLOAD_REQUIRED, date: '2024-01-01' }))).toBe(true);
  });
});

describe('isActiveBooking', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_TIME);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns true for PENDING booking with future date', () => {
    expect(isActiveBooking(makeBooking({ status: BookingStatus.PENDING, date: '2030-01-01' }))).toBe(true);
  });

  it('returns true for CONFIRMED booking with future date', () => {
    expect(isActiveBooking(makeBooking({ status: BookingStatus.CONFIRMED, date: '2030-01-01' }))).toBe(true);
  });

  it('returns false for COMPLETED booking', () => {
    expect(isActiveBooking(makeBooking({ status: BookingStatus.COMPLETED, date: '2030-01-01' }))).toBe(false);
  });

  it('returns false for CANCELLED booking', () => {
    expect(isActiveBooking(makeBooking({ status: BookingStatus.CANCELLED, date: '2030-01-01' }))).toBe(false);
  });

  it('returns false for PENDING booking with past date', () => {
    expect(isActiveBooking(makeBooking({ status: BookingStatus.PENDING, date: '2024-01-01' }))).toBe(false);
  });
});
