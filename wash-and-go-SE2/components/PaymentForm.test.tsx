import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  getDiscountLabel,
  EmailRegisteredModal,
  MobileSummaryStrip,
  DesktopSummarySidebar,
  PaymentMethodSection,
  type PaymentMethod,
} from './PaymentForm';
import { ServiceCategory, VehicleSize } from '../types';
import type { ServicePackage } from '../types';

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
