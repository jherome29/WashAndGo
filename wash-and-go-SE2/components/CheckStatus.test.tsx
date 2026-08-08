import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import CheckStatus from './CheckStatus';
import { AuthProvider } from '../context/AuthContext';
import { api } from '../lib/api';
import { VehicleSize, BookingStatus } from '../types';
import type { Booking } from '../types';

vi.mock('../lib/api', () => ({
  api: {
    getBookingByToken: vi.fn(),
  },
}));

function renderGuest(initialBookingId?: string) {
  return render(
    <AuthProvider user={null} token={null} forceRecoveryMode={false}>
      <CheckStatus initialBookingId={initialBookingId} />
    </AuthProvider>,
  );
}

const booking: Booking = {
  id: 'BK-000001',
  customerName: 'Juan Dela Cruz',
  customerPhone: '09171234567',
  serviceId: 'svc-1',
  serviceName: 'Premium Wash',
  vehicleSize: VehicleSize.MEDIUM,
  date: '2026-08-01',
  timeSlot: '10:00 AM',
  totalPrice: 500,
  downPaymentAmount: 150,
  status: BookingStatus.REUPLOAD_REQUIRED,
  createdAt: Date.now(),
};

describe('CheckStatus deep-link prefill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });


  it('auto-looks-up the booking with zero clicks when arriving via an email deep link', async () => {
    (api.getBookingByToken as any).mockResolvedValue(booking);

    renderGuest('BK-000001');

    await waitFor(() => expect(api.getBookingByToken).toHaveBeenCalledWith('BK-000001'));
    expect(screen.getByDisplayValue('BK-000001')).toBeInTheDocument();
  });

  it('opens on the Guest Lookup tab with an empty field when there is no deep link', () => {
    renderGuest();

    expect(api.getBookingByToken).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('BK-123456')).toHaveValue('');
  });
});
