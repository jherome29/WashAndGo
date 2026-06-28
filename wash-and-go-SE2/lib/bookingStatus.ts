import type { Booking } from '../types';

const ACTIVE_STATUSES = new Set(['PENDING', 'PENDING_VERIFICATION', 'REUPLOAD_REQUIRED', 'REUPLOAD_SUBMITTED', 'CONFIRMED', 'IN_PROGRESS']);
const PAST_STATUSES = new Set(['COMPLETED', 'CANCELLED']);

export function normalizeBookingStatus(status: string) {
  return status.toUpperCase().replace(/[\s-]/g, '_');
}

function manilaDateKey(date: Date) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

function manilaMinutes(date: Date) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const hour = Number(parts.find(part => part.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find(part => part.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

function parseSlotMinutes(time?: string) {
  const match = time?.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = match[3].toUpperCase();

  if (period === 'PM' && hour !== 12) hour += 12;
  if (period === 'AM' && hour === 12) hour = 0;

  return hour * 60 + minute;
}

function isScheduledInPast(booking: Booking) {
  const today = manilaDateKey(new Date());
  if (booking.date < today) return true;
  if (booking.date > today) return false;

  const slotMinutes = parseSlotMinutes(booking.time ?? booking.timeSlot);
  if (slotMinutes === null) return false;

  return slotMinutes <= manilaMinutes(new Date());
}

export function isPastBooking(booking: Booking) {
  const status = normalizeBookingStatus(booking.status as string);
  return PAST_STATUSES.has(status) || (status !== 'IN_PROGRESS' && isScheduledInPast(booking));
}

export function isActiveBooking(booking: Booking) {
  const status = normalizeBookingStatus(booking.status as string);
  return ACTIVE_STATUSES.has(status) && !isPastBooking(booking);
}
