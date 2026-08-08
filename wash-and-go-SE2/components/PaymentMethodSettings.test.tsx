import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PaymentMethodSettings, {
  isGCashMethod,
  accountNumberHint,
  isValidAccountNumber,
  sortPaymentMethods,
  dropZoneClass,
  PaymentMethodCard,
  type PaymentSettingRow,
} from './PaymentMethodSettings';
import { api } from '../lib/api';
import { AuthProvider } from '../context/AuthContext';

vi.mock('../lib/api', () => ({
  api: {
    getAdminPaymentSettings: vi.fn(),
    updateAdminPaymentSettings: vi.fn(),
    getSignedViewUrl: vi.fn(),
    getAssetUploadUrl: vi.fn(),
  },
}));

describe('isGCashMethod', () => {
  it('matches regardless of case', () => {
    expect(isGCashMethod('GCash')).toBe(true);
    expect(isGCashMethod('gcash')).toBe(true);
  });
  it('does not match other methods', () => {
    expect(isGCashMethod('Bank Transfer')).toBe(false);
  });
});

describe('accountNumberHint', () => {
  it('shows the mobile-number hint for GCash', () => {
    expect(accountNumberHint('GCash')).toMatch(/09171234567/);
  });
  it('shows the digit-count hint for other methods', () => {
    expect(accountNumberHint('Bank Transfer')).toMatch(/10–19 digits/);
  });
});

describe('isValidAccountNumber', () => {
  it('accepts a valid GCash number with dashes', () => {
    expect(isValidAccountNumber('GCash', '0917-123-4567')).toBe(true);
  });
  it('rejects a GCash number not starting with 09', () => {
    expect(isValidAccountNumber('GCash', '08171234567')).toBe(false);
  });
  it('accepts a 10-digit bank number', () => {
    expect(isValidAccountNumber('Bank Transfer', '1234567890')).toBe(true);
  });
  it('accepts a 19-digit bank number', () => {
    expect(isValidAccountNumber('Bank Transfer', '1234567890123456789')).toBe(true);
  });
  it('rejects a 9-digit bank number', () => {
    expect(isValidAccountNumber('Bank Transfer', '123456789')).toBe(false);
  });
  it('rejects letters in a bank number', () => {
    expect(isValidAccountNumber('Bank Transfer', '12345ABCDE')).toBe(false);
  });
});

describe('sortPaymentMethods', () => {
  it('always puts GCash first', () => {
    const rows = [
      { payment_method: 'Bank Transfer', account_name: '', account_number: '', qr_image_path: null },
      { payment_method: 'GCash', account_name: '', account_number: '', qr_image_path: null },
    ] as PaymentSettingRow[];
    expect(sortPaymentMethods(rows).map(r => r.payment_method)).toEqual(['GCash', 'Bank Transfer']);
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

const gcashRow: PaymentSettingRow = {
  payment_method: 'GCash',
  account_name: 'Wash & Go Baliwag',
  account_number: '09171234567',
  qr_image_path: null,
};

describe('PaymentMethodCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the account name and number in view mode', () => {
    render(<PaymentMethodCard row={gcashRow} qrUrl={null} token="t" onSaved={vi.fn()} />);
    expect(screen.getByText('Wash & Go Baliwag')).toBeInTheDocument();
    expect(screen.getByText('09171234567')).toBeInTheDocument();
  });

  it('shows the QR image when a qrUrl is provided', () => {
    render(<PaymentMethodCard row={gcashRow} qrUrl="https://example.com/qr.png" token="t" onSaved={vi.fn()} />);
    expect(screen.getByAltText('GCash QR Code')).toHaveAttribute('src', 'https://example.com/qr.png');
  });

  it('opens a large view of the QR code when clicked, and closes it again', () => {
    render(<PaymentMethodCard row={gcashRow} qrUrl="https://example.com/qr.png" token="t" onSaved={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByAltText('GCash QR Code'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Close'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('enters edit mode and disables Save until the number is valid', () => {
    render(<PaymentMethodCard row={gcashRow} qrUrl={null} token="t" onSaved={vi.fn()} />);
    fireEvent.click(screen.getByText('Edit'));
    const numberInput = screen.getByDisplayValue('09171234567');
    fireEvent.change(numberInput, { target: { value: '123' } });
    expect(screen.getByText('Save Changes').closest('button')).toBeDisabled();
    fireEvent.change(numberInput, { target: { value: '09171234567' } });
    expect(screen.getByText('Save Changes').closest('button')).not.toBeDisabled();
  });

  it('saves a name/number-only edit directly, without a confirm modal', async () => {
    (api.updateAdminPaymentSettings as any).mockResolvedValue({ updated_at: '2026-08-08T00:00:00Z' });
    const onSaved = vi.fn();
    render(<PaymentMethodCard row={gcashRow} qrUrl={null} token="t" onSaved={onSaved} />);
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.change(screen.getByDisplayValue('Wash & Go Baliwag'), { target: { value: 'Wash & Go Main' } });
    fireEvent.click(screen.getByText('Save Changes'));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(api.updateAdminPaymentSettings).toHaveBeenCalledWith(
      expect.objectContaining({ paymentMethod: 'GCash', accountName: 'Wash & Go Main' }),
      't',
    );
    expect(screen.queryByText('Confirm Update')).not.toBeInTheDocument();
  });

  it('re-opens Edit with the values the backend persisted, not the ones that were typed', async () => {
    // Backend normalizes the GCash number to digits only and sanitizes the name.
    (api.updateAdminPaymentSettings as any).mockResolvedValue({
      payment_method: 'GCash',
      account_name: 'Wash & Go Main',
      account_number: '09171234567',
      qr_image_path: null,
      updated_at: '2026-08-08T00:00:00Z',
    });
    const onSaved = vi.fn();
    render(<PaymentMethodCard row={gcashRow} qrUrl={null} token="t" onSaved={onSaved} />);
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.change(screen.getByDisplayValue('Wash & Go Baliwag'), { target: { value: 'Wash & Go Main' } });
    fireEvent.change(screen.getByDisplayValue('09171234567'), { target: { value: '0917-123-4567' } });
    fireEvent.click(screen.getByText('Save Changes'));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());

    // The parent is handed the persisted row, not the dashed value that was typed.
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ account_name: 'Wash & Go Main', account_number: '09171234567' }),
      undefined,
    );

    // Re-opening Edit must not resurrect the pre-save / un-normalized values —
    // confirming again would otherwise silently write them back.
    fireEvent.click(screen.getByText('Edit'));
    expect(screen.getByDisplayValue('Wash & Go Main')).toBeInTheDocument();
    expect(screen.getByDisplayValue('09171234567')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('0917-123-4567')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('Wash & Go Baliwag')).not.toBeInTheDocument();
  });

  it('shows the confirm-replace modal when a new QR file is chosen before saving', async () => {
    const file = new File(['x'], 'qr.png', { type: 'image/png' });
    render(<PaymentMethodCard row={gcashRow} qrUrl={null} token="t" onSaved={vi.fn()} />);
    fireEvent.click(screen.getByText('Edit'));
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });
    fireEvent.click(screen.getByText('Save Changes'));
    expect(await screen.findByText('Update GCash QR Code?')).toBeInTheDocument();
  });

  it('closes the confirm modal and shows the error inline when the QR save fails after upload', async () => {
    (api.getAssetUploadUrl as any).mockResolvedValue({ signedUrl: 'https://example.com/upload', path: 'assets/qr.png' });
    global.fetch = vi.fn().mockResolvedValue({ ok: true } as Response);
    (api.updateAdminPaymentSettings as any).mockRejectedValue(new Error('Save failed'));
    const file = new File(['x'], 'qr.png', { type: 'image/png' });
    render(<PaymentMethodCard row={gcashRow} qrUrl={null} token="t" onSaved={vi.fn()} />);
    fireEvent.click(screen.getByText('Edit'));
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });
    fireEvent.click(screen.getByText('Save Changes'));
    expect(await screen.findByText('Update GCash QR Code?')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Confirm Update'));
    await waitFor(() => expect(screen.queryByText('Update GCash QR Code?')).not.toBeInTheDocument());
    expect(screen.getByText('Save failed')).toBeInTheDocument();
  });

  it('does not persist the QR path when the upload PUT fails', async () => {
    (api.getAssetUploadUrl as any).mockResolvedValue({ signedUrl: 'https://example.com/upload', path: 'qr/123-qr_png' });
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403 } as Response);
    const file = new File(['x'], 'qr.png', { type: 'image/png' });
    render(<PaymentMethodCard row={gcashRow} qrUrl={null} token="t" onSaved={vi.fn()} />);
    fireEvent.click(screen.getByText('Edit'));
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });
    fireEvent.click(screen.getByText('Save Changes'));
    expect(await screen.findByText('Update GCash QR Code?')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Confirm Update'));

    await waitFor(() => expect(screen.getByText(/QR image upload failed/)).toBeInTheDocument());
    // The failed upload must block the persist step — otherwise qr_image_path
    // would point at a file that was never written.
    expect(api.updateAdminPaymentSettings).not.toHaveBeenCalled();
    expect(screen.queryByText('Update GCash QR Code?')).not.toBeInTheDocument();
  });

  it('forwards the file size and MIME type so the backend can validate the QR upload', async () => {
    (api.getAssetUploadUrl as any).mockResolvedValue({ signedUrl: 'https://example.com/upload', path: 'qr/123-qr_png' });
    global.fetch = vi.fn().mockResolvedValue({ ok: true } as Response);
    (api.updateAdminPaymentSettings as any).mockResolvedValue({ ...gcashRow, qr_image_path: 'qr/123-qr_png' });
    (api.getSignedViewUrl as any).mockResolvedValue({ signedUrl: 'https://example.com/qr.png' });
    const file = new File(['x'], 'my qr.png', { type: 'image/png' });
    const onSaved = vi.fn();
    render(<PaymentMethodCard row={gcashRow} qrUrl={null} token="t" onSaved={onSaved} />);
    fireEvent.click(screen.getByText('Edit'));
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });
    fireEvent.click(screen.getByText('Save Changes'));
    expect(await screen.findByText('Update GCash QR Code?')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Confirm Update'));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(api.getAssetUploadUrl).toHaveBeenCalledWith('my_qr.png', 't', file.size, 'image/png');
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ qr_image_path: 'qr/123-qr_png' }),
      'https://example.com/qr.png',
    );
  });
});

describe('PaymentMethodSettings (container)', () => {
  function renderContainer() {
    return render(
      <AuthProvider user={{ name: 'Admin', email: 'admin@example.com', isStaff: true } as any} token="test-token" forceRecoveryMode={false}>
        <PaymentMethodSettings />
      </AuthProvider>,
    );
  }

  it('fetches and renders a card per payment method, GCash first', async () => {
    (api.getAdminPaymentSettings as any).mockResolvedValue([
      { payment_method: 'Bank Transfer', account_name: 'Wash & Go Inc.', account_number: '1234567890', qr_image_path: null },
      { payment_method: 'GCash', account_name: 'Wash & Go Baliwag', account_number: '09171234567', qr_image_path: null },
    ]);
    renderContainer();
    await waitFor(() => expect(screen.getByText('GCash')).toBeInTheDocument());
    expect(screen.getByText('Bank Transfer')).toBeInTheDocument();
  });

  it('shows an error message if the fetch fails', async () => {
    (api.getAdminPaymentSettings as any).mockRejectedValue(new Error('Network error'));
    renderContainer();
    await waitFor(() => expect(screen.getByText('Network error')).toBeInTheDocument());
  });
});
