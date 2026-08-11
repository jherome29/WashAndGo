import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api } from './api';
import { BookingStatus } from '../types';

describe('api.addBookingUpdate', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: 'u1' }),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('includes status in the request body when a combined status + note action is posted', async () => {
    await api.addBookingUpdate('BK-1001', 'Confirmed:', [], 'token-abc', BookingStatus.CONFIRMED);

    const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({ message: 'Confirmed:', imageUrls: [], status: BookingStatus.CONFIRMED });
  });

  it('omits status from the request body for a plain note with no status change', async () => {
    await api.addBookingUpdate('BK-1001', 'Just a note', [], 'token-abc');

    const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({ message: 'Just a note', imageUrls: [] });
  });
});
