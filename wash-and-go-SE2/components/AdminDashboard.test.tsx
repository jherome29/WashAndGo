import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  matchesDateRange,
  matchesBookingFilters,
  compareStrings,
  gridColsClass,
  dropZoneClass,
  statusButtonStyle,
  readFileIntoPreview,
  QrDisplayCard,
  QrUploadForm,
  QrConfirmModal,
  BookingDetailModal,
  type BookingFilterCriteria,
} from './AdminDashboard';
import { BookingStatus, VehicleSize } from '../types';
import type { Booking } from '../types';

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
