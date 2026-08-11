import type { ComponentProps } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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

function renderAuthenticated(props: Partial<ComponentProps<typeof CheckStatus>> = {}) {
  return render(
    <AuthProvider user={{ name: 'Juan', email: 'juan@example.com', isStaff: false }} token="t" forceRecoveryMode={false}>
      <CheckStatus userBookings={[]} {...props} />
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

  it('switches between the Guest Lookup and Membership tabs', () => {
    renderGuest();

    expect(screen.getByPlaceholderText('BK-123456')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Membership'));
    expect(screen.getByPlaceholderText('CWG-000123')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('BK-123456')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Guest Lookup'));
    expect(screen.getByPlaceholderText('BK-123456')).toBeInTheDocument();
  });
});

const activeBooking: Booking = { ...booking, id: 'BK-ACTIVE', serviceName: 'Active Wash', status: BookingStatus.CONFIRMED, date: '2099-01-01' };
const activeBooking2: Booking = { ...booking, id: 'BK-ACTIVE-2', serviceName: 'Active Wash 2', status: BookingStatus.CONFIRMED, date: '2099-02-01' };
const pastBooking: Booking = { ...booking, id: 'BK-PAST', serviceName: 'Past Wash', status: BookingStatus.COMPLETED, date: '2020-01-01' };

describe('CheckStatus authenticated bookings tabs', () => {
  it('defaults to the Active tab (sorted) and switches to Past on click', () => {
    renderAuthenticated({ userBookings: [activeBooking, activeBooking2, pastBooking] });

    expect(screen.getByText('Active Wash')).toBeInTheDocument();
    expect(screen.getByText('Active Wash 2')).toBeInTheDocument();
    expect(screen.queryByText('Past Wash')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText(/^Past/));

    expect(screen.getByText('Past Wash')).toBeInTheDocument();
    expect(screen.queryByText('Active Wash')).not.toBeInTheDocument();
  });

  it('shows a loading state instead of the booking list', () => {
    renderAuthenticated({ userBookings: [activeBooking], loading: true });

    expect(screen.getByText('Loading your bookings…')).toBeInTheDocument();
    expect(screen.queryByText('Active Wash')).not.toBeInTheDocument();
  });

  it('shows an empty state per tab when there are no bookings', () => {
    renderAuthenticated({ userBookings: [] });

    expect(screen.getByText('No Active Bookings')).toBeInTheDocument();

    fireEvent.click(screen.getByText(/^Past/));

    expect(screen.getByText('No Past Bookings')).toBeInTheDocument();
  });
});
