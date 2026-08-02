import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { createRef } from 'react';
import AdminDashboard, {
  matchesDateRange,
  matchesBookingFilters,
  compareStrings,
  gridColsClass,
  dropZoneClass,
  statusButtonStyle,
  readFileIntoPreview,
  parseSlotToMins,
  draftPriceToNumber,
  pricesAreEqual,
  sanitizePriceInput,
  QrDisplayCard,
  QrUploadForm,
  QrConfirmModal,
  BookingDetailModal,
  type BookingFilterCriteria,
} from './AdminDashboard';
import { AuthProvider } from '../context/AuthContext';
import { BookingStatus, VehicleSize, ServiceCategory } from '../types';
import type { Booking, ServicePackage } from '../types';

vi.mock('../lib/api', () => ({
  api: {
    getSignedViewUrl: vi.fn().mockResolvedValue({ signedUrl: 'https://example.com/proof.png' }),
    declinePayment: vi.fn().mockResolvedValue({}),
  },
}));

// Isolate AdminDashboard's own logic: MembershipsPanel and ScheduleSettings are
// separate containers with their own auth/api dependencies, already covered by
// their own test files (MembershipsPanel.test.tsx) or intentionally out of scope
// (ScheduleSettings, whose only new-code change this branch made was a 1-line
// sort-comparator fix).
vi.mock('./MembershipsPanel', () => ({ default: () => <div>Memberships Mock</div> }));
vi.mock('./ScheduleSettings', () => ({ default: () => <div>Schedule Settings Mock</div> }));

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

describe('matchesDateRange', () => {
  it('matches today only for the today range', () => {
    expect(matchesDateRange('2026-08-01', 'today', '', '2026-08-01')).toBe(true);
    expect(matchesDateRange('2026-08-02', 'today', '', '2026-08-01')).toBe(false);
  });
  it('matches dates after today for upcoming', () => {
    expect(matchesDateRange('2026-08-02', 'upcoming', '', '2026-08-01')).toBe(true);
    expect(matchesDateRange('2026-08-01', 'upcoming', '', '2026-08-01')).toBe(false);
  });
  it('matches dates before today for past', () => {
    expect(matchesDateRange('2026-07-31', 'past', '', '2026-08-01')).toBe(true);
    expect(matchesDateRange('2026-08-01', 'past', '', '2026-08-01')).toBe(false);
  });
  it('matches an exact custom date when provided', () => {
    expect(matchesDateRange('2026-08-05', 'custom', '2026-08-05', '2026-08-01')).toBe(true);
    expect(matchesDateRange('2026-08-06', 'custom', '2026-08-05', '2026-08-01')).toBe(false);
  });
  it('matches everything for custom range with no date chosen yet', () => {
    expect(matchesDateRange('2026-08-06', 'custom', '', '2026-08-01')).toBe(true);
  });
  it('matches everything for the all range', () => {
    expect(matchesDateRange('2020-01-01', 'all', '', '2026-08-01')).toBe(true);
  });
});

describe('matchesBookingFilters', () => {
  const baseCriteria: BookingFilterCriteria = {
    filterStatus: 'All',
    filterVehicle: 'All',
    dateRange: 'all',
    filterDate: '',
    today: '2026-08-01',
    query: '',
  };

  it('matches everything when filters are all "All"', () => {
    expect(matchesBookingFilters(makeBooking(), baseCriteria)).toBe(true);
  });

  it('filters by status, tolerant of case/spacing differences', () => {
    const booking = makeBooking({ status: BookingStatus.PENDING_VERIFICATION });
    expect(matchesBookingFilters(booking, { ...baseCriteria, filterStatus: BookingStatus.PENDING_VERIFICATION })).toBe(true);
    expect(matchesBookingFilters(booking, { ...baseCriteria, filterStatus: BookingStatus.CONFIRMED })).toBe(false);
  });

  it('filters by vehicle category', () => {
    const booking = makeBooking({ vehicleCategory: 'Car' });
    expect(matchesBookingFilters(booking, { ...baseCriteria, filterVehicle: 'Car' })).toBe(true);
    expect(matchesBookingFilters(booking, { ...baseCriteria, filterVehicle: 'Motorcycle' })).toBe(false);
  });

  it('filters by date range', () => {
    const booking = makeBooking({ date: '2020-01-01' });
    expect(matchesBookingFilters(booking, { ...baseCriteria, dateRange: 'today' })).toBe(false);
  });

  it('filters by a free-text query matching id, name, phone, or email', () => {
    const booking = makeBooking({ customerEmail: 'juan@example.com' });
    expect(matchesBookingFilters(booking, { ...baseCriteria, query: 'juan dela cruz' })).toBe(true);
    expect(matchesBookingFilters(booking, { ...baseCriteria, query: 'juan@example.com' })).toBe(true);
    expect(matchesBookingFilters(booking, { ...baseCriteria, query: 'nonexistent' })).toBe(false);
  });
});

describe('compareStrings', () => {
  it('returns -1, 0, or 1 like a standard comparator', () => {
    expect(compareStrings('a', 'b')).toBe(-1);
    expect(compareStrings('b', 'a')).toBe(1);
    expect(compareStrings('a', 'a')).toBe(0);
  });
});

describe('gridColsClass', () => {
  it('returns grid-cols-1 for a single item', () => {
    expect(gridColsClass(1)).toBe('grid-cols-1');
  });
  it('returns grid-cols-2 for two items', () => {
    expect(gridColsClass(2)).toBe('grid-cols-2');
  });
  it('returns grid-cols-3 for three or more items', () => {
    expect(gridColsClass(3)).toBe('grid-cols-3');
    expect(gridColsClass(6)).toBe('grid-cols-3');
  });
});

describe('dropZoneClass', () => {
  it('prioritizes the dragging state', () => {
    expect(dropZoneClass(true, true)).toBe('border-orange-400 bg-orange-50');
  });
  it('shows the has-file state when not dragging', () => {
    expect(dropZoneClass(false, true)).toBe('border-green-300 bg-green-50');
  });
  it('shows the empty state otherwise', () => {
    expect(dropZoneClass(false, false)).toBe('border-gray-200 hover:border-orange-300 hover:bg-orange-50/40');
  });
});

describe('statusButtonStyle', () => {
  const meta = { color: '#111', bg: '#eee', border: '#ccc' };
  it('uses the meta colors when a status change is pending', () => {
    expect(statusButtonStyle(true, false, true, meta)).toEqual({ color: '#111', backgroundColor: '#eee', borderColor: '#ccc' });
  });
  it('dims the meta colors for the current status with no pending change', () => {
    expect(statusButtonStyle(false, true, false, meta)).toEqual({ color: '#111', backgroundColor: '#eee', borderColor: '#ccc', opacity: 0.5 });
  });
  it('uses neutral colors for an inactive, non-pending status', () => {
    expect(statusButtonStyle(false, false, false, meta)).toEqual({ color: '#9ca3af', backgroundColor: '#ffffff', borderColor: '#e5e7eb' });
  });
});

describe('readFileIntoPreview', () => {
  it('reads the file and sets the preview at the given index via FileReader', async () => {
    const file = new File(['hello'], 'photo.png', { type: 'image/png' });
    let latest: string[] = ['', ''];
    let notifyCalled: () => void;
    const called = new Promise<void>(resolve => { notifyCalled = resolve; });
    const setPreviews = vi.fn((updater: (prev: string[]) => string[]) => {
      latest = updater(latest);
      notifyCalled();
    });

    readFileIntoPreview(file, 1, setPreviews);

    // jsdom's FileReader completes asynchronously — wait for its onloadend callback.
    await called;

    expect(setPreviews).toHaveBeenCalled();
    expect(latest[1]).toMatch(/^data:/);
    expect(latest[0]).toBe('');
  });
});

describe('parseSlotToMins', () => {
  it('parses a regular AM time', () => {
    expect(parseSlotToMins('09:30 AM')).toBe(9 * 60 + 30);
  });
  it('parses a regular PM time by adding 12 hours', () => {
    expect(parseSlotToMins('02:15 PM')).toBe(14 * 60 + 15);
  });
  it('treats 12 AM as midnight (0 minutes into the day)', () => {
    expect(parseSlotToMins('12:00 AM')).toBe(0);
  });
  it('treats 12 PM as noon, not adding 12 more hours', () => {
    expect(parseSlotToMins('12:00 PM')).toBe(12 * 60);
  });
  it('returns 0 for missing or unparseable input', () => {
    expect(parseSlotToMins(undefined)).toBe(0);
    expect(parseSlotToMins('not a time')).toBe(0);
  });
});

describe('draftPriceToNumber', () => {
  it('returns 0 for undefined or empty string', () => {
    expect(draftPriceToNumber(undefined)).toBe(0);
    expect(draftPriceToNumber('')).toBe(0);
  });
  it('parses a numeric string', () => {
    expect(draftPriceToNumber('350')).toBe(350);
  });
  it('returns 0 for a non-numeric string', () => {
    expect(draftPriceToNumber('abc')).toBe(0);
  });
});

describe('pricesAreEqual', () => {
  it('returns true when draft and saved prices match', () => {
    expect(pricesAreEqual({ SMALL: '300' }, { SMALL: 300 })).toBe(true);
  });
  it('returns false when a price differs', () => {
    expect(pricesAreEqual({ SMALL: '350' }, { SMALL: 300 })).toBe(false);
  });
  it('treats a missing saved price as 0', () => {
    expect(pricesAreEqual({ SMALL: '0' }, {})).toBe(true);
  });
});

describe('sanitizePriceInput', () => {
  it('strips non-digit characters', () => {
    expect(sanitizePriceInput('₱1,200abc')).toBe('1200');
  });
  it('strips leading zeros but keeps a lone zero', () => {
    expect(sanitizePriceInput('0050')).toBe('50');
    expect(sanitizePriceInput('0')).toBe('0');
  });
});

describe('QrDisplayCard', () => {
  it('shows the upload prompt when there is no QR yet', () => {
    const onEdit = vi.fn();
    render(<QrDisplayCard qrUrl={null} updatedAt={null} onEdit={onEdit} />);
    expect(screen.getByText('No QR Code Uploaded')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Upload QR Code'));
    expect(onEdit).toHaveBeenCalled();
  });

  it('shows the current QR image and Active badge when set', () => {
    render(<QrDisplayCard qrUrl="https://example.com/qr.png" updatedAt="2026-08-01T00:00:00Z" onEdit={() => {}} />);
    expect(screen.getByAltText('GCash QR Code')).toHaveAttribute('src', 'https://example.com/qr.png');
    expect(screen.getByText('Active')).toBeInTheDocument();
  });
});

describe('QrUploadForm', () => {
  const baseProps = {
    dragging: false,
    setDragging: vi.fn(),
    newFile: null,
    newPreview: null,
    error: null,
    fileInputRef: createRef<HTMLInputElement>(),
    onFileChosen: vi.fn(),
    onSaveClick: vi.fn(),
    onCancel: vi.fn(),
  };

  it('shows the drop prompt when no file is chosen', () => {
    render(<QrUploadForm {...baseProps} />);
    expect(screen.getByText('Drag & drop QR image')).toBeInTheDocument();
  });

  it('shows the preview and file name once a file is chosen', () => {
    const file = new File(['x'], 'qr.png', { type: 'image/png' });
    render(<QrUploadForm {...baseProps} newFile={file} newPreview="blob:mock-url" />);
    expect(screen.getByText('qr.png')).toBeInTheDocument();
    expect(screen.getByAltText('Preview')).toHaveAttribute('src', 'blob:mock-url');
  });

  it('shows the error message when present', () => {
    render(<QrUploadForm {...baseProps} error="File too large - max 5MB." />);
    expect(screen.getByText('File too large - max 5MB.')).toBeInTheDocument();
  });

  it('disables Save Changes until a file is chosen', () => {
    render(<QrUploadForm {...baseProps} />);
    expect(screen.getByText('Save Changes').closest('button')).toBeDisabled();
  });

  it('calls onSaveClick and onCancel', () => {
    const onSaveClick = vi.fn();
    const onCancel = vi.fn();
    const file = new File(['x'], 'qr.png', { type: 'image/png' });
    render(<QrUploadForm {...baseProps} newFile={file} newPreview="blob:mock-url" onSaveClick={onSaveClick} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('Save Changes'));
    expect(onSaveClick).toHaveBeenCalled();
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });
});

describe('QrConfirmModal', () => {
  it('shows a placeholder icon when there is no current QR', () => {
    render(<QrConfirmModal qrUrl={null} newPreview="blob:new" saving={false} onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.queryByAltText('Current QR')).not.toBeInTheDocument();
    expect(screen.getByAltText('New QR')).toBeInTheDocument();
  });

  it('shows Saving… and disables confirm while saving', () => {
    render(<QrConfirmModal qrUrl="https://example.com/old.png" newPreview="blob:new" saving onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByText('Saving…')).toBeInTheDocument();
    expect(screen.getByText('Saving…').closest('button')).toBeDisabled();
  });

  it('calls onConfirm and onCancel', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<QrConfirmModal qrUrl={null} newPreview="blob:new" saving={false} onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('Confirm Update'));
    expect(onConfirm).toHaveBeenCalled();
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });
});

describe('BookingDetailModal', () => {
  const baseProps = {
    booking: makeBooking(),
    onClose: vi.fn(),
    loadingProofUrl: false,
    proofViewUrl: null,
    pendingStatus: null,
    setPendingStatus: vi.fn(),
    showCancelConfirm: false,
    setShowCancelConfirm: vi.fn(),
    onConfirmCancel: vi.fn(),
    declineReason: '',
    setDeclineReason: vi.fn(),
    declineError: '',
    setDeclineError: vi.fn(),
    decliningPayment: false,
    onDeclinePayment: vi.fn(),
    updateMessage: '',
    setUpdateMessage: vi.fn(),
    updateImages: [],
    updatePreviews: [],
    postingUpdate: false,
    onPostUpdate: vi.fn(e => e.preventDefault()),
    onImageSelect: vi.fn(),
    onRemoveImage: vi.fn(),
    fileInputRef: createRef<HTMLInputElement>(),
  };

  it('shows the booking id and a Guest badge for guest bookings', () => {
    render(<BookingDetailModal {...baseProps} booking={makeBooking({ userId: undefined })} />);
    expect(screen.getByText('#BK-0001')).toBeInTheDocument();
    expect(screen.getByText('Guest')).toBeInTheDocument();
  });

  it('hides the Guest badge for logged-in customers and shows the plate number', () => {
    render(<BookingDetailModal {...baseProps} booking={makeBooking({ userId: 'u1', plateNumber: 'ABC1234' })} />);
    expect(screen.queryByText('Guest')).not.toBeInTheDocument();
    expect(screen.getByText('ABC1234')).toBeInTheDocument();
  });

  it('shows the decline-payment panel only while payment is under review', () => {
    const { rerender } = render(<BookingDetailModal {...baseProps} booking={makeBooking({ status: BookingStatus.PENDING_VERIFICATION })} />);
    expect(screen.getByText('Decline & Request Reupload')).toBeInTheDocument();

    rerender(<BookingDetailModal {...baseProps} booking={makeBooking({ status: BookingStatus.CONFIRMED })} />);
    expect(screen.queryByText(/Decline & Request Reupload/)).not.toBeInTheDocument();
  });

  it('shows the cancel confirmation panel when showCancelConfirm is true', () => {
    render(<BookingDetailModal {...baseProps} showCancelConfirm />);
    expect(screen.getByText('Cancel this booking?')).toBeInTheDocument();
  });

  it('shows the pending-status indicator once a status change is queued', () => {
    render(<BookingDetailModal {...baseProps} pendingStatus={BookingStatus.CONFIRMED} />);
    expect(screen.getByText('Will change to:')).toBeInTheDocument();
  });

  it('shows update history entries, most recent first', () => {
    render(
      <BookingDetailModal
        {...baseProps}
        booking={makeBooking({
          updates: [
            { id: 'u1', timestamp: '2026-08-01T00:00:00Z', message: 'First note' },
            { id: 'u2', timestamp: '2026-08-02T00:00:00Z', message: 'Second note' },
          ],
        })}
      />,
    );
    expect(screen.getByText('First note')).toBeInTheDocument();
    expect(screen.getByText('Second note')).toBeInTheDocument();
  });

  it('shows "No updates posted yet." when there are none', () => {
    render(<BookingDetailModal {...baseProps} booking={makeBooking({ updates: [] })} />);
    expect(screen.getByText('No updates posted yet.')).toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<BookingDetailModal {...baseProps} onClose={onClose} />);
    // The header close (X) button is the first button rendered in the modal.
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(onClose).toHaveBeenCalled();
  });

  it('queues a status change when a status action button is clicked', () => {
    const setPendingStatus = vi.fn();
    render(<BookingDetailModal {...baseProps} setPendingStatus={setPendingStatus} />);
    fireEvent.click(screen.getByText('Confirmed'));
    expect(setPendingStatus).toHaveBeenCalled();
  });
});

// ─── Container: AdminDashboard (default export) ──────────────────────────────
// MembershipsPanel and ScheduleSettings are mocked away (see top of file) so
// this suite exercises AdminDashboard's own state/handlers in isolation --
// tab switching, booking filters, the manage-booking modal round trip, and
// service price editing. GcashQRSettings can't be mocked away (it's a local
// const in the same file, not a separate module) so its initial fetch runs
// for real against the chainable supabase mock from vitest.setup.ts.

const groomingService: ServicePackage = {
  id: 'svc-groom',
  category: ServiceCategory.GROOMING,
  name: 'Premium Wash',
  description: 'Full detail wash',
  durationHours: 1,
  prices: { SMALL: 300, MEDIUM: 400, LARGE: 500, EXTRA_LARGE: 600 } as Record<VehicleSize, number>,
  isLubeFlat: false,
};

function renderDashboard(overrides: { bookings?: Booking[]; services?: ServicePackage[] } = {}) {
  const onUpdateStatus = vi.fn().mockResolvedValue(undefined);
  const onAddUpdate = vi.fn().mockResolvedValue(undefined);
  const onUpdateService = vi.fn().mockResolvedValue(undefined);
  const utils = render(
    <AuthProvider user={{ name: 'Admin', email: 'admin@example.com', isStaff: true }} token="test-token" forceRecoveryMode={false}>
      <AdminDashboard
        bookings={overrides.bookings ?? []}
        services={overrides.services ?? [groomingService]}
        onUpdateStatus={onUpdateStatus}
        onAddUpdate={onAddUpdate}
        onUpdateService={onUpdateService}
      />
    </AuthProvider>,
  );
  return { ...utils, onUpdateStatus, onAddUpdate, onUpdateService };
}

describe('AdminDashboard (container)', () => {
  it('shows booking stats and renders each booking row', () => {
    const bookings = [
      makeBooking({ id: 'BK-1001', customerName: 'Ana Reyes', status: BookingStatus.PENDING_VERIFICATION }),
      makeBooking({ id: 'BK-1002', customerName: 'Ben Cruz', status: BookingStatus.CONFIRMED }),
    ];
    renderDashboard({ bookings });
    expect(screen.getByText('Ana Reyes')).toBeInTheDocument();
    expect(screen.getByText('Ben Cruz')).toBeInTheDocument();
    expect(screen.getByText('#BK-1001')).toBeInTheDocument();
  });

  it('filters the booking list by the search box', () => {
    const bookings = [
      makeBooking({ id: 'BK-1001', customerName: 'Ana Reyes' }),
      makeBooking({ id: 'BK-1002', customerName: 'Ben Cruz' }),
    ];
    renderDashboard({ bookings });
    fireEvent.change(screen.getByPlaceholderText(/Search by ID, name, phone or email/i), { target: { value: 'ana' } });
    expect(screen.getByText('Ana Reyes')).toBeInTheDocument();
    expect(screen.queryByText('Ben Cruz')).not.toBeInTheDocument();
  });

  it('shows a no-match message when filters exclude every booking', () => {
    renderDashboard({ bookings: [makeBooking({ customerName: 'Ana Reyes' })] });
    fireEvent.change(screen.getByPlaceholderText(/Search by ID, name, phone or email/i), { target: { value: 'nobody' } });
    expect(screen.getByText('No bookings match the current filters.')).toBeInTheDocument();
  });

  it('opens the manage-booking modal and completes a status change end to end', async () => {
    const booking = makeBooking({ id: 'BK-1001', customerName: 'Ana Reyes', status: BookingStatus.PENDING_VERIFICATION });
    const { onUpdateStatus, onAddUpdate } = renderDashboard({ bookings: [booking] });

    fireEvent.click(screen.getByText('Manage'));
    expect(screen.getByText('Managing Booking')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmed' }));
    fireEvent.click(screen.getByRole('button', { name: /Apply Confirmed & Post/i }));

    await vi.waitFor(() => expect(onUpdateStatus).toHaveBeenCalledWith('BK-1001', BookingStatus.CONFIRMED));
    expect(onAddUpdate).toHaveBeenCalled();
  });

  it('closes the modal when the close button is clicked', () => {
    renderDashboard({ bookings: [makeBooking({ id: 'BK-1001' })] });
    fireEvent.click(screen.getByText('Manage'));
    expect(screen.getByText('Managing Booking')).toBeInTheDocument();
    // The close (X) button is the only button in the header row alongside the title block.
    const header = screen.getByText('Managing Booking').closest('div')!.parentElement!;
    fireEvent.click(within(header).getByRole('button'));
    expect(screen.queryByText('Managing Booking')).not.toBeInTheDocument();
  });

  it('cancels a booking through the confirm flow', async () => {
    const booking = makeBooking({ id: 'BK-1001' });
    const { onUpdateStatus, onAddUpdate } = renderDashboard({ bookings: [booking] });

    fireEvent.click(screen.getByText('Manage'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelled' }));
    expect(screen.getByText('Cancel this booking?')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Yes, Cancel Booking'));
    await vi.waitFor(() => expect(onUpdateStatus).toHaveBeenCalledWith('BK-1001', BookingStatus.CANCELLED));
    expect(onAddUpdate).toHaveBeenCalled();
  });

  it('declines a payment with the typed reason', async () => {
    const booking = makeBooking({ id: 'BK-1001', status: BookingStatus.PENDING_VERIFICATION, paymentProofPath: 'proofs/1.png' });
    const { onUpdateStatus } = renderDashboard({ bookings: [booking] });

    fireEvent.click(screen.getByText('Manage'));
    fireEvent.change(screen.getByPlaceholderText(/Tell the customer why their proof was declined/i), {
      target: { value: 'Screenshot is blurry' },
    });
    fireEvent.click(screen.getByText('Decline & Request Reupload'));

    await vi.waitFor(() => expect(onUpdateStatus).toHaveBeenCalledWith('BK-1001', BookingStatus.REUPLOAD_REQUIRED));
  });

  it('marks a service dirty on price edit and saves it via Save All', async () => {
    const { onUpdateService } = renderDashboard({ services: [groomingService] });

    fireEvent.click(screen.getByText('Services & Rates'));
    fireEvent.click(screen.getByText('Premium Wash'));

    fireEvent.change(screen.getByDisplayValue('300'), { target: { value: '350' } });
    expect(screen.getByText('unsaved')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Save All'));
    await vi.waitFor(() =>
      expect(onUpdateService).toHaveBeenCalledWith('svc-groom', expect.objectContaining({ price_small: 350 })),
    );
  });

  it('switches to the Memberships tab', () => {
    renderDashboard();
    fireEvent.click(screen.getByText('Memberships'));
    expect(screen.getByText('Memberships Mock')).toBeInTheDocument();
  });

  it('switches to the Settings tab and shows the empty QR state', async () => {
    renderDashboard();
    fireEvent.click(screen.getByText('Settings'));
    expect(screen.getByText('Schedule Settings Mock')).toBeInTheDocument();
    expect(await screen.findByText('No QR Code Uploaded')).toBeInTheDocument();
  });

  it('counts an active LUBE booking scheduled today in the capacity overview', () => {
    const today = new Date().toISOString().split('T')[0];
    const lubeService: ServicePackage = {
      id: 'svc-lube', category: ServiceCategory.LUBE, name: 'Express Lube', description: '',
      durationHours: 1, prices: {} as Record<VehicleSize, number>, isLubeFlat: true,
    };
    renderDashboard({
      services: [groomingService, lubeService],
      bookings: [makeBooking({ id: 'BK-2001', serviceId: 'svc-lube', date: today, status: BookingStatus.CONFIRMED })],
    });
    expect(screen.getByText('1 / 1')).toBeInTheDocument();
  });

  it('saves dirty services via the Ctrl+S keyboard shortcut', async () => {
    const { onUpdateService } = renderDashboard();
    fireEvent.click(screen.getByText('Services & Rates'));
    fireEvent.click(screen.getByText('Premium Wash'));
    fireEvent.change(screen.getByDisplayValue('300'), { target: { value: '350' } });

    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    await vi.waitFor(() =>
      expect(onUpdateService).toHaveBeenCalledWith('svc-groom', expect.objectContaining({ price_small: 350 })),
    );
  });

  it('reverts a single service via its Reset button', () => {
    renderDashboard();
    fireEvent.click(screen.getByText('Services & Rates'));
    fireEvent.click(screen.getByText('Premium Wash'));
    fireEvent.change(screen.getByDisplayValue('300'), { target: { value: '350' } });
    expect(screen.getByText('unsaved')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Reset'));
    expect(screen.queryByText('unsaved')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('300')).toBeInTheDocument();
  });

  it('discards all pending service edits via the floating Discard button', () => {
    renderDashboard();
    fireEvent.click(screen.getByText('Services & Rates'));
    fireEvent.click(screen.getByText('Premium Wash'));
    fireEvent.change(screen.getByDisplayValue('300'), { target: { value: '350' } });
    expect(screen.getByText('1 unsaved change')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Discard'));
    expect(screen.queryByText('1 unsaved change')).not.toBeInTheDocument();
  });

  it('selects and removes a progress-update image', async () => {
    renderDashboard({ bookings: [makeBooking({ id: 'BK-1001' })] });
    fireEvent.click(screen.getByText('Manage'));

    const file = new File(['x'], 'progress.png', { type: 'image/png' });
    const fileInput = document.querySelector('input[type="file"][multiple]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(await screen.findByAltText('Preview 1')).toBeInTheDocument();

    fireEvent.click(screen.getByAltText('Preview 1').closest('div')!.querySelector('button')!);
    await vi.waitFor(() => expect(screen.queryByAltText('Preview 1')).not.toBeInTheDocument());
  });

  it('shows update-history images when a past update included photos', () => {
    renderDashboard({
      bookings: [makeBooking({
        id: 'BK-1001',
        updates: [{ id: 'u1', timestamp: '2026-08-01T00:00:00Z', message: 'Washed and waxed', imageUrls: ['https://example.com/a.png', 'https://example.com/b.png'] }],
      })],
    });
    fireEvent.click(screen.getByText('Manage'));
    expect(screen.getByAltText('Update 1')).toBeInTheDocument();
    expect(screen.getByAltText('Update 2')).toBeInTheDocument();
  });
});

// isMobile is driven by actual window.innerWidth (see lib/useIsMobile.ts) rather
// than a CSS breakpoint, so these tests force a mobile-width viewport before
// rendering to exercise the stacked-card layout instead of the table.
function setMobileViewport() {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 375 });
}

describe('AdminDashboard (container) — mobile card layout', () => {
  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 });
  });

  it('renders bookings as stacked cards instead of a table on a mobile-width viewport', () => {
    setMobileViewport();
    const booking = makeBooking({ id: 'BK-2001', customerName: 'Mobile Tester', status: BookingStatus.CONFIRMED });
    const { container } = renderDashboard({ bookings: [booking] });

    expect(screen.getByText('Mobile Tester')).toBeInTheDocument();
    expect(screen.getByText('#BK-2001')).toBeInTheDocument();
    expect(container.querySelector('table')).toBeNull();
  });

  it('opens the manage modal and completes a status change from a mobile card', async () => {
    setMobileViewport();
    const booking = makeBooking({ id: 'BK-2002', customerName: 'Mobile Tester', status: BookingStatus.PENDING_VERIFICATION });
    const { onUpdateStatus, onAddUpdate } = renderDashboard({ bookings: [booking] });

    fireEvent.click(screen.getByText('Manage'));
    expect(screen.getByText('Managing Booking')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmed' }));
    fireEvent.click(screen.getByRole('button', { name: /Apply Confirmed & Post/i }));

    await vi.waitFor(() => expect(onUpdateStatus).toHaveBeenCalledWith('BK-2002', BookingStatus.CONFIRMED));
    expect(onAddUpdate).toHaveBeenCalled();
  });

  it('shows the no-match empty state on mobile too', () => {
    setMobileViewport();
    renderDashboard({ bookings: [makeBooking({ customerName: 'Ana Reyes' })] });
    fireEvent.change(screen.getByPlaceholderText(/Search by ID, name, phone or email/i), { target: { value: 'nobody' } });
    expect(screen.getByText('No bookings match the current filters.')).toBeInTheDocument();
  });
});
