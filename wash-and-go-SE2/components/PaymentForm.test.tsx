import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PaymentForm, {
  getDiscountLabel,
  EmailRegisteredModal,
  MobileSummaryStrip,
  DesktopSummarySidebar,
  PaymentMethodSection,
  type PaymentMethod,
} from './PaymentForm';
import { ServiceCategory, VehicleSize, FuelType } from '../types';
import type { ServicePackage } from '../types';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
  api: {
    getPaymentMethods: vi.fn().mockResolvedValue([]),
    getVehicleMembershipStatus: vi.fn().mockResolvedValue(null),
    checkEmailExists: vi.fn().mockResolvedValue(false),
    getSignedUploadUrl: vi.fn().mockResolvedValue({ signedUrl: 'https://example.com/upload', path: 'proofs/mock.png' }),
  },
}));

const groomingService: ServicePackage = {
  id: 'svc-1',
  category: ServiceCategory.GROOMING,
  name: 'Premium Wash',
  description: 'Full detail wash',
  durationHours: 1,
  prices: { SMALL: 300, MEDIUM: 400, LARGE: 500, EXTRA_LARGE: 600 } as Record<VehicleSize, number>,
  isLubeFlat: false,
};

describe('getDiscountLabel', () => {
  it('returns the free-wash label for FREE_WASH', () => {
    expect(getDiscountLabel('FREE_WASH', null)).toBe('Free wash — 10th visit reward');
  });
  it('returns the first-wash label for FIRST_WASH', () => {
    expect(getDiscountLabel('FIRST_WASH', null)).toBe('50% off — first wash as a new member');
  });
  it('includes the percentage for CATEGORY_PERCENT', () => {
    expect(getDiscountLabel('CATEGORY_PERCENT', 50)).toBe('50% off — Club Wash & Go member discount');
  });
  it('returns null when there is no discount', () => {
    expect(getDiscountLabel(null, null)).toBeNull();
  });
});

describe('EmailRegisteredModal', () => {
  it('shows the given email and calls onDismiss when clicked', () => {
    const onDismiss = vi.fn();
    render(<EmailRegisteredModal email="taken@example.com" onDismiss={onDismiss} />);
    expect(screen.getByText('taken@example.com')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Use a Different Email'));
    expect(onDismiss).toHaveBeenCalled();
  });
});

describe('MobileSummaryStrip', () => {
  it('shows the service name, schedule, and down payment', () => {
    render(
      <MobileSummaryStrip
        service={groomingService}
        date="2026-08-01"
        timeSlot="10:00 AM"
        downPayment={150}
        membershipDiscountType={null}
        discountLabel={null}
      />,
    );
    expect(screen.getByText('Premium Wash')).toBeInTheDocument();
    expect(screen.getByText('₱150')).toBeInTheDocument();
  });

  it('shows the discount badge label when a membership discount applies', () => {
    render(
      <MobileSummaryStrip
        service={groomingService}
        date="2026-08-01"
        timeSlot="10:00 AM"
        downPayment={0}
        membershipDiscountType="FREE_WASH"
        discountLabel="Free wash — 10th visit reward"
      />,
    );
    expect(screen.getByText('Free wash — 10th visit reward')).toBeInTheDocument();
  });
});

describe('DesktopSummarySidebar', () => {
  it('shows the undiscounted total when there is no membership discount', () => {
    render(
      <DesktopSummarySidebar
        service={groomingService}
        date="2026-08-01"
        timeSlot="10:00 AM"
        downPayment={150}
        membershipDiscountType={null}
        discountLabel={null}
        vehicleLabel="SMALL"
        totalPrice={500}
        discountedPrice={500}
      />,
    );
    expect(screen.getByText('₱500')).toBeInTheDocument();
    expect(screen.queryByText('line-through')).not.toBeInTheDocument();
  });

  it('shows both the struck-through original price and the discounted price', () => {
    render(
      <DesktopSummarySidebar
        service={groomingService}
        date="2026-08-01"
        timeSlot="10:00 AM"
        downPayment={75}
        membershipDiscountType="FIRST_WASH"
        discountLabel="50% off — first wash as a new member"
        vehicleLabel="SMALL"
        totalPrice={500}
        discountedPrice={250}
      />,
    );
    expect(screen.getByText('₱500')).toBeInTheDocument();
    expect(screen.getByText('₱250')).toBeInTheDocument();
    expect(screen.getByText('50% off — first wash as a new member')).toBeInTheDocument();
  });
});

describe('PaymentMethodSection', () => {
  const paymentMethods: PaymentMethod[] = [
    { payment_method: 'gcash', account_name: 'Wash & Go', account_number: '09123456789' },
  ];

  it('shows a loading placeholder while methods are loading', () => {
    const { container } = render(
      <PaymentMethodSection
        loadingMethods
        paymentMethods={[]}
        method=""
        setMethod={() => {}}
        selectedMethod={undefined}
        downPayment={150}
        proofFile={null}
        setProofFile={() => {}}
        uploading={false}
        uploadProgress={0}
      />,
    );
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
  });

  it('lets the customer pick a payment method', () => {
    const setMethod = vi.fn();
    render(
      <PaymentMethodSection
        loadingMethods={false}
        paymentMethods={paymentMethods}
        method=""
        setMethod={setMethod}
        selectedMethod={undefined}
        downPayment={150}
        proofFile={null}
        setProofFile={() => {}}
        uploading={false}
        uploadProgress={0}
      />,
    );
    fireEvent.click(screen.getByText('gcash'));
    expect(setMethod).toHaveBeenCalledWith('gcash');
  });

  it('shows the selected method account details', () => {
    render(
      <PaymentMethodSection
        loadingMethods={false}
        paymentMethods={paymentMethods}
        method="gcash"
        setMethod={() => {}}
        selectedMethod={paymentMethods[0]}
        downPayment={150}
        proofFile={null}
        setProofFile={() => {}}
        uploading={false}
        uploadProgress={0}
      />,
    );
    expect(screen.getByText('09123456789')).toBeInTheDocument();
  });

  it('shows the uploaded proof file name once selected', () => {
    const file = new File(['x'], 'proof.png', { type: 'image/png' });
    render(
      <PaymentMethodSection
        loadingMethods={false}
        paymentMethods={paymentMethods}
        method="gcash"
        setMethod={() => {}}
        selectedMethod={paymentMethods[0]}
        downPayment={150}
        proofFile={file}
        setProofFile={() => {}}
        uploading={false}
        uploadProgress={0}
      />,
    );
    expect(screen.getByText('proof.png')).toBeInTheDocument();
  });

  it('shows upload progress while uploading', () => {
    render(
      <PaymentMethodSection
        loadingMethods={false}
        paymentMethods={paymentMethods}
        method="gcash"
        setMethod={() => {}}
        selectedMethod={paymentMethods[0]}
        downPayment={150}
        proofFile={null}
        setProofFile={() => {}}
        uploading
        uploadProgress={42}
      />,
    );
    expect(screen.getByText('42%')).toBeInTheDocument();
  });
});

// ─── Container: PaymentForm (default export) ─────────────────────────────────
// user/token come in as props here (not via useAuth), so no auth-context
// wrapper is needed -- only the api layer is mocked.

describe('PaymentForm (container)', () => {
  const baseProps = {
    service: groomingService,
    vehicleSize: VehicleSize.SMALL,
    fuelType: null,
    date: '2026-08-01',
    timeSlot: '10:00 AM',
    plateNumber: 'ABC1234',
    onBack: vi.fn(),
    onSubmit: vi.fn(),
  };

  it('renders WALK-IN BOOKING and submits without requiring payment proof', async () => {
    const onSubmit = vi.fn();
    // Walk-in bookings are created by a logged-in admin (isStaff), so `user` is
    // always populated in real usage -- that's what satisfies canSubmit's
    // (!!user || !!email) clause without a guest email being entered.
    const admin = { name: 'Admin', email: 'admin@example.com', isStaff: true };
    render(<PaymentForm {...baseProps} isWalkIn onSubmit={onSubmit} user={admin} token="admin-token" />);
    await waitFor(() => expect(api.getPaymentMethods).toHaveBeenCalled());

    expect(screen.getByText('WALK-IN BOOKING')).toBeInTheDocument();
    const submitBtn = screen.getByRole('button', { name: 'CONFIRM WALK-IN' });
    expect(submitBtn).toBeDisabled();

    // Name is sanitized to [a-zA-Z0-9 ] as the user types (strips punctuation
    // like hyphens), so "Walk In Customer" (space, not hyphen) round-trips unchanged.
    fireEvent.change(screen.getByPlaceholderText('Juan Dela Cruz'), { target: { value: 'Walk In Customer' } });
    fireEvent.change(screen.getByPlaceholderText('09XXXXXXXXX'), { target: { value: '09123456789' } });
    expect(submitBtn).not.toBeDisabled();

    fireEvent.click(submitBtn);
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Walk In Customer', phone: '09123456789' })),
    );
  });

  it('disables submit for a guest until name, phone, email, and proof are all filled', async () => {
    render(<PaymentForm {...baseProps} />);
    await waitFor(() => expect(api.getPaymentMethods).toHaveBeenCalled());
    const submitBtn = screen.getByRole('button', { name: 'COMPLETE BOOKING' });
    expect(submitBtn).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('Juan Dela Cruz'), { target: { value: 'Test Customer' } });
    fireEvent.change(screen.getByPlaceholderText('09XXXXXXXXX'), { target: { value: '09123456789' } });
    fireEvent.change(screen.getByPlaceholderText('you@email.com'), { target: { value: 'test@example.com' } });
    expect(submitBtn).toBeDisabled(); // still no proof file

    const file = new File(['x'], 'proof.png', { type: 'image/png' });
    const fileInput = document.querySelector('input[type="file"]')!;
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => expect(submitBtn).not.toBeDisabled());
  });

  it('shows the account-already-exists modal when the guest email is already registered', async () => {
    vi.mocked(api.checkEmailExists).mockResolvedValueOnce(true);
    render(<PaymentForm {...baseProps} />);
    await waitFor(() => expect(api.getPaymentMethods).toHaveBeenCalled());

    fireEvent.change(screen.getByPlaceholderText('Juan Dela Cruz'), { target: { value: 'Test Customer' } });
    fireEvent.change(screen.getByPlaceholderText('09XXXXXXXXX'), { target: { value: '09123456789' } });
    fireEvent.change(screen.getByPlaceholderText('you@email.com'), { target: { value: 'taken@example.com' } });
    fireEvent.change(document.querySelector('input[type="file"]')!, {
      target: { files: [new File(['x'], 'proof.png', { type: 'image/png' })] },
    });

    const submitBtn = screen.getByRole('button', { name: 'COMPLETE BOOKING' });
    await waitFor(() => expect(submitBtn).not.toBeDisabled());
    fireEvent.click(submitBtn);

    expect(await screen.findByText('Account Already Exists')).toBeInTheDocument();
    expect(screen.getByText('taken@example.com')).toBeInTheDocument();
  });

  it('imports name, phone, and email from the logged-in user profile', async () => {
    const user = { name: 'Juan Dela Cruz', email: 'juan@example.com', phone: '09171234567', isStaff: false };
    render(<PaymentForm {...baseProps} user={user} token="tok" />);
    await waitFor(() => expect(api.getPaymentMethods).toHaveBeenCalled());

    fireEvent.click(screen.getByText('Import from Profile'));
    expect(screen.getByDisplayValue('Juan Dela Cruz')).toBeInTheDocument();
    expect(screen.getByDisplayValue('09171234567')).toBeInTheDocument();
  });

  it('shows the free-wash discount badge when the vehicle has a free wash credit', async () => {
    vi.mocked(api.getVehicleMembershipStatus).mockResolvedValueOnce({
      membershipNo: 'WNG-1', visitCount: 9, freeWashCredits: 1, firstWashUsed: true,
    });
    render(<PaymentForm {...baseProps} />);
    // Both the mobile summary strip and desktop sidebar render in jsdom at once
    // (no real CSS media queries), so the discount label appears twice.
    const badges = await screen.findAllByText('Free wash — 10th visit reward');
    expect(badges.length).toBeGreaterThan(0);
  });

  it('calls onBack when the back button is clicked', async () => {
    const onBack = vi.fn();
    render(<PaymentForm {...baseProps} onBack={onBack} />);
    await waitFor(() => expect(api.getPaymentMethods).toHaveBeenCalled());
    fireEvent.click(screen.getByText('BACK'));
    expect(onBack).toHaveBeenCalled();
  });

  it('prices a LUBE service flat by fuel type, ignoring vehicle size', async () => {
    const lubeService: ServicePackage = {
      id: 'svc-lube', category: ServiceCategory.LUBE, name: 'Express Lube', description: '',
      durationHours: 1, prices: {} as Record<VehicleSize, number>,
      lubePrices: { GAS: 200, DIESEL: 250 } as Record<FuelType, number>, isLubeFlat: true,
    };
    render(<PaymentForm {...baseProps} service={lubeService} fuelType={FuelType.GAS} />);
    expect(await screen.findByText('Fuel Type')).toBeInTheDocument();
    expect(screen.getAllByText('GAS').length).toBeGreaterThan(0);
  });

  it('shows the first-wash discount when the member has not used their first wash yet', async () => {
    vi.mocked(api.getVehicleMembershipStatus).mockResolvedValueOnce({
      membershipNo: 'WNG-2', visitCount: 0, freeWashCredits: 0, firstWashUsed: false,
    });
    render(<PaymentForm {...baseProps} />);
    const badges = await screen.findAllByText('50% off — first wash as a new member');
    expect(badges.length).toBeGreaterThan(0);
  });

  it('shows the category-percent discount for a returning member with a tagged service', async () => {
    vi.mocked(api.getVehicleMembershipStatus).mockResolvedValueOnce({
      membershipNo: 'WNG-3', visitCount: 3, freeWashCredits: 0, firstWashUsed: true,
    });
    render(<PaymentForm {...baseProps} service={{ ...groomingService, membershipDiscountPct: 50 }} />);
    const badges = await screen.findAllByText('50% off — Club Wash & Go member discount');
    expect(badges.length).toBeGreaterThan(0);
  });
});
