# Editable Payment Methods (GCash + Bank Transfer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the bug where an admin-uploaded GCash QR never reaches checkout, and generalize the admin Settings UI so both GCash and a renamed "Bank Transfer" method have editable account name/number and QR upload, with PH-format validation on the account number.

**Architecture:** The backend already has a complete, working pipeline for this (`payment_settings` table → `PATCH /api/admin/payment-settings` → `GET /api/admin/payment-methods` public read → signed QR URLs) — it's just missing one route (`StorageService.createAssetUploadUrl()` exists but no controller calls it) and has no format validation. The admin frontend currently bypasses all of this and talks to Supabase directly from a hardcoded `GcashQRSettings` component. The fix wires the frontend onto the real backend path and deletes the bypass.

**Tech Stack:** NestJS + class-validator + Supabase (backend); React + Vite + Vitest + Testing Library (frontend); Jest (backend tests).

## Global Constraints

- GCash account number format: exactly 11 digits, `09XXXXXXXXX` (PH mobile number). Stored normalized to digits-only.
- Bank Transfer account number format: 10–19 digits after stripping spaces/dashes for the check. Stored as typed (dashes/spaces kept for display).
- No UI to add or delete a payment method — exactly two rows (`GCash`, `Bank Transfer`) are edited in place.
- Every new admin-only backend endpoint/mutation follows this repo's two-layer auth pattern: `@UseGuards(SupabaseAuthGuard)` on the controller method AND `requireAdmin()`/equivalent inside the service.
- This repo manages Supabase schema/data manually (no migrations folder) — the one required data change (renaming the existing `BDO` row) is a manual SQL statement, not code.

---

## File Structure

| File | Change |
|---|---|
| `wash-and-go-backend/src/storage/storage.controller.ts` | Add `POST /api/storage/asset-upload-url` route (admin-guarded), wired to the existing `StorageService.createAssetUploadUrl()`. |
| `wash-and-go-backend/src/admin/admin.service.ts` | Add `normalizeAndValidateAccountNumber()`, apply it + `stripHtml()` in `updatePaymentSettings()`, add the missing audit log call. |
| `wash-and-go-backend/src/admin/admin.service.spec.ts` | New `describe('AdminService.updatePaymentSettings')` block. |
| `wash-and-go-backend/CLAUDE.md` | Add `UPDATE_PAYMENT_SETTINGS` to the audit log action table. |
| `wash-and-go-SE2/lib/api.ts` | Add `getAssetUploadUrl()` wrapper. |
| `wash-and-go-SE2/components/PaymentMethodSettings.tsx` | **New.** Replaces `GcashQRSettings` — generic per-method card (QR + account name/number, view/edit modes) rendered once per row from `/admin/payment-settings`. |
| `wash-and-go-SE2/components/PaymentMethodSettings.test.tsx` | **New.** Tests for the pure helpers and the card/container components. |
| `wash-and-go-SE2/components/AdminDashboard.tsx` | Remove `GcashQRSettings` + its 3 sub-components + now-unused imports; render `<PaymentMethodSettings />` in the Settings tab instead. |
| `wash-and-go-SE2/components/AdminDashboard.test.tsx` | Remove the old QR-component tests/imports; mock `./PaymentMethodSettings` like the other extracted panels. |
| `wash-and-go-SE2/constants.ts` | Rename the offline-fallback `bdo`/`BDO Bank Transfer` entry to `Bank Transfer`. |

---

### Task 1: Backend — expose the QR asset-upload endpoint

**Files:**
- Modify: `wash-and-go-backend/src/storage/storage.controller.ts`

**Interfaces:**
- Consumes: `StorageService.createAssetUploadUrl(fileName: string, userId: string): Promise<{ signedUrl: string; path: string }>` — already implemented in `storage.service.ts:104`, already calls `requireAdmin(userId)` internally, already scopes the path to `qr/<timestamp>-<filename>` in the `shop-assets` bucket.
- Produces: `POST /api/storage/asset-upload-url?fileName=<name>` — Task 4's frontend code calls this.

This is a 5-line passthrough — this repo has no existing controller-level test files for `storage.controller.ts` or `admin.controller.ts` (business logic is tested at the service layer instead), so this task follows that established convention rather than introducing a new one.

- [ ] **Step 1: Add the route**

In `storage.controller.ts`, add the import and the new method:

```ts
import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { StorageService } from './storage.service';
import { OptionalAuthGuard } from '../auth/guards/optional-auth.guard';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('storage')
export class StorageController {
  constructor(private storageService: StorageService) {}

  // ...existing upload-url and view-url methods unchanged...

  /**
   * POST /api/storage/asset-upload-url?fileName=qr.png
   * Admin only — signed upload URL for shop assets (payment QR codes).
   */
  @UseGuards(SupabaseAuthGuard)
  @Post('asset-upload-url')
  getAssetUploadUrl(@Query('fileName') fileName: string, @CurrentUser() user: any) {
    return this.storageService.createAssetUploadUrl(fileName, user.id);
  }
}
```

- [ ] **Step 2: Verify it compiles and the existing suite is unaffected**

Run: `cd wash-and-go-backend && npm run build && npm test`
Expected: build succeeds, all existing tests still pass (this task adds no new backend logic, just routes to an already-implemented, already-admin-gated service method).

- [ ] **Step 3: Commit**

```bash
git add wash-and-go-backend/src/storage/storage.controller.ts
git commit -m "feat: expose admin signed-upload endpoint for payment QR images"
```

---

### Task 2: Backend — validate, sanitize, and audit-log payment settings updates

**Files:**
- Modify: `wash-and-go-backend/src/admin/admin.service.ts`
- Modify: `wash-and-go-backend/src/admin/admin.service.spec.ts`
- Modify: `wash-and-go-backend/CLAUDE.md`

**Interfaces:**
- Produces: `export function normalizeAndValidateAccountNumber(paymentMethod: string, accountNumber: string): string` — throws `BadRequestException` on an invalid format, otherwise returns the value to store (digits-only for GCash, trimmed-as-typed for everything else).
- `AdminService.updatePaymentSettings()`'s behavior changes: rejects malformed account numbers with a `400`, strips HTML from `accountName`/`accountNumber`, and now calls `void this.auditLog.log(...)`.

- [ ] **Step 1: Write the failing tests for the validator + service behavior**

Add to `wash-and-go-backend/src/admin/admin.service.spec.ts` (uses the existing `buildService`/`mockChain`/`adminProfile` helpers already defined at the top of this file):

```ts
describe('AdminService.updatePaymentSettings', () => {
  it('rejects a GCash number that is not 11 digits starting with 09', async () => {
    const { service } = buildService({ profiles: adminProfile() });
    await expect(
      service.updatePaymentSettings(
        { paymentMethod: 'GCash', accountName: 'Wash & Go', accountNumber: '123456' } as any,
        'admin-1',
      ),
    ).rejects.toThrow('GCash number must be a valid PH mobile number (09XXXXXXXXX)');
  });

  it('accepts a valid GCash number and normalizes dashes away', async () => {
    const settingsChain = mockChain({ data: { payment_method: 'GCash' } });
    const { service } = buildService({ profiles: adminProfile(), payment_settings: settingsChain });
    await service.updatePaymentSettings(
      { paymentMethod: 'GCash', accountName: 'Wash & Go', accountNumber: '0917-123-4567' } as any,
      'admin-1',
    );
    expect(settingsChain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ account_number: '09171234567' }),
      expect.anything(),
    );
  });

  it('rejects a bank account number that is too short', async () => {
    const { service } = buildService({ profiles: adminProfile() });
    await expect(
      service.updatePaymentSettings(
        { paymentMethod: 'Bank Transfer', accountName: 'Wash & Go', accountNumber: '12345' } as any,
        'admin-1',
      ),
    ).rejects.toThrow('Account number must be 10–19 digits');
  });

  it('rejects a bank account number containing letters', async () => {
    const { service } = buildService({ profiles: adminProfile() });
    await expect(
      service.updatePaymentSettings(
        { paymentMethod: 'Bank Transfer', accountName: 'Wash & Go', accountNumber: '12345ABCDE' } as any,
        'admin-1',
      ),
    ).rejects.toThrow('Account number must be 10–19 digits');
  });

  it('accepts a valid bank account number and keeps its dashes', async () => {
    const settingsChain = mockChain({ data: { payment_method: 'Bank Transfer' } });
    const { service } = buildService({ profiles: adminProfile(), payment_settings: settingsChain });
    await service.updatePaymentSettings(
      { paymentMethod: 'Bank Transfer', accountName: 'Wash & Go', accountNumber: '1234-5678-90' } as any,
      'admin-1',
    );
    expect(settingsChain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ account_number: '1234-5678-90' }),
      expect.anything(),
    );
  });

  it('strips HTML from the account name before saving', async () => {
    const settingsChain = mockChain({ data: { payment_method: 'GCash' } });
    const { service } = buildService({ profiles: adminProfile(), payment_settings: settingsChain });
    await service.updatePaymentSettings(
      { paymentMethod: 'GCash', accountName: '<b>Wash & Go</b>', accountNumber: '09171234567' } as any,
      'admin-1',
    );
    expect(settingsChain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ account_name: 'Wash & Go' }),
      expect.anything(),
    );
  });

  it('audit-logs UPDATE_PAYMENT_SETTINGS on success', async () => {
    const settingsChain = mockChain({ data: { payment_method: 'GCash' } });
    const { service, auditLog } = buildService({ profiles: adminProfile(), payment_settings: settingsChain });
    await service.updatePaymentSettings(
      { paymentMethod: 'GCash', accountName: 'Wash & Go', accountNumber: '09171234567' } as any,
      'admin-1',
    );
    expect(auditLog.log).toHaveBeenCalledWith(
      'admin-1', 'UPDATE_PAYMENT_SETTINGS', 'GCash',
      expect.objectContaining({ accountName: 'Wash & Go' }),
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd wash-and-go-backend && npm test -- admin.service.spec.ts`
Expected: FAIL — `updatePaymentSettings` doesn't validate format yet, doesn't call `auditLog.log`, and the mock's `payment_settings` table isn't wired into `buildService`'s default `mockChain({ data: null })` fallback (it'll resolve, since `buildService` already falls back for any table not explicitly passed — the new tests pass `payment_settings` explicitly where they check the upsert payload, so this should fail specifically on the assertions, not on a missing mock).

- [ ] **Step 3: Implement the validator and wire it into the service**

In `admin.service.ts`, add this exported function above the `@Injectable()` class (same placement style as `stripHtml` in `bookings.service.ts`):

```ts
export function normalizeAndValidateAccountNumber(paymentMethod: string, accountNumber: string): string {
  const isGCash = paymentMethod.trim().toLowerCase() === 'gcash';
  const digitsOnly = accountNumber.replace(/[\s-]/g, '');

  if (isGCash) {
    if (!/^09\d{9}$/.test(digitsOnly)) {
      throw new BadRequestException('GCash number must be a valid PH mobile number (09XXXXXXXXX)');
    }
    return digitsOnly;
  }
  if (!/^\d{10,19}$/.test(digitsOnly)) {
    throw new BadRequestException('Account number must be 10–19 digits');
  }
  return accountNumber.trim();
}
```

Then update `updatePaymentSettings()` (existing method, ~line 40):

```ts
async updatePaymentSettings(dto: UpdatePaymentSettingsDto, userId: string) {
    await this.requireAdmin(userId);
    const sanitizedName = stripHtml(dto.accountName);
    const normalizedNumber = normalizeAndValidateAccountNumber(dto.paymentMethod, stripHtml(dto.accountNumber));
    const { data, error } = await this.supabase
      .getAdminClient()
      .from('payment_settings')
      .upsert({
        payment_method: dto.paymentMethod,
        account_name: sanitizedName,
        account_number: normalizedNumber,
        qr_image_path: dto.qrImagePath || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'payment_method' })
      .select()
      .single();
    if (error) throw new Error(error.message);
    void this.auditLog.log(userId, 'UPDATE_PAYMENT_SETTINGS', dto.paymentMethod, {
      accountName: sanitizedName,
      qrChanged: !!dto.qrImagePath,
    });
    return data;
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd wash-and-go-backend && npm test -- admin.service.spec.ts`
Expected: PASS — all 7 new tests plus the existing schedule/override tests in this file green.

- [ ] **Step 5: Update the backend audit log docs**

In `wash-and-go-backend/CLAUDE.md`, add a row to the "Logged operations" table under "Admin Audit Logging":

```
| `UPDATE_PAYMENT_SETTINGS` | `updatePaymentSettings()` |
```

- [ ] **Step 6: Commit**

```bash
git add wash-and-go-backend/src/admin/admin.service.ts wash-and-go-backend/src/admin/admin.service.spec.ts wash-and-go-backend/CLAUDE.md
git commit -m "feat: validate PH account number formats and audit-log payment settings updates"
```

---

### Task 3: Frontend — new `PaymentMethodSettings.tsx` (replaces `GcashQRSettings`)

**Files:**
- Modify: `wash-and-go-SE2/lib/api.ts` (add `getAssetUploadUrl` — small enough to fold into this task rather than its own)
- Create: `wash-and-go-SE2/components/PaymentMethodSettings.tsx`
- Create: `wash-and-go-SE2/components/PaymentMethodSettings.test.tsx`

**Interfaces:**
- Consumes: `api.getAdminPaymentSettings(token)`, `api.updateAdminPaymentSettings(dto, token)`, `api.getSignedViewUrl(path, bookingId?, statusToken?, authToken?)` — all already exist in `lib/api.ts`. `useAuth()` from `../context/AuthContext` for `{ token }`.
- Produces:
  - `export function isGCashMethod(paymentMethod: string): boolean`
  - `export function accountNumberHint(paymentMethod: string): string`
  - `export function isValidAccountNumber(paymentMethod: string, accountNumber: string): boolean`
  - `export function sortPaymentMethods(rows: PaymentSettingRow[]): PaymentSettingRow[]`
  - `export function dropZoneClass(dragging: boolean, hasFile: boolean): string`
  - `export interface PaymentSettingRow { payment_method: string; account_name: string; account_number: string; qr_image_path: string | null; updated_at?: string | null }`
  - `export function PaymentMethodCard(props: { row: PaymentSettingRow; qrUrl: string | null; token: string; onSaved: (updated: PaymentSettingRow, qrUrl?: string | null) => void }): JSX.Element`
  - `export default function PaymentMethodSettings(): JSX.Element` — this is what Task 4 imports into `AdminDashboard.tsx`.

- [ ] **Step 1: Add the `getAssetUploadUrl` API wrapper**

In `wash-and-go-SE2/lib/api.ts`, add next to `getSignedUploadUrl`:

```ts
  getAssetUploadUrl: (fileName: string, token: string) => {
    const params = new URLSearchParams({ fileName });
    return request<{ signedUrl: string; path: string }>(`/storage/asset-upload-url?${params}`, {
      method: 'POST',
      headers: authHeaders(token),
    });
  },
```

- [ ] **Step 2: Write the failing tests for the pure helpers**

Create `wash-and-go-SE2/components/PaymentMethodSettings.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
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
  it('shows the account name and number in view mode', () => {
    render(<PaymentMethodCard row={gcashRow} qrUrl={null} token="t" onSaved={vi.fn()} />);
    expect(screen.getByText('Wash & Go Baliwag')).toBeInTheDocument();
    expect(screen.getByText('09171234567')).toBeInTheDocument();
  });

  it('shows the QR image when a qrUrl is provided', () => {
    render(<PaymentMethodCard row={gcashRow} qrUrl="https://example.com/qr.png" token="t" onSaved={vi.fn()} />);
    expect(screen.getByAltText('GCash QR Code')).toHaveAttribute('src', 'https://example.com/qr.png');
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

  it('shows the confirm-replace modal when a new QR file is chosen before saving', async () => {
    const file = new File(['x'], 'qr.png', { type: 'image/png' });
    render(<PaymentMethodCard row={gcashRow} qrUrl={null} token="t" onSaved={vi.fn()} />);
    fireEvent.click(screen.getByText('Edit'));
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });
    fireEvent.click(screen.getByText('Save Changes'));
    expect(await screen.findByText('Update GCash QR Code?')).toBeInTheDocument();
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd wash-and-go-SE2 && npx vitest run components/PaymentMethodSettings.test.tsx`
Expected: FAIL — `./PaymentMethodSettings` doesn't exist yet.

- [ ] **Step 4: Implement `PaymentMethodSettings.tsx`**

Create `wash-and-go-SE2/components/PaymentMethodSettings.tsx`:

```tsx
import React, { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import {
  QrCode, ImagePlus, AlertTriangle, RefreshCw, Loader2, Save, Upload,
  AlertCircle, CheckCircle2,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export interface PaymentSettingRow {
  payment_method: string;
  account_name: string;
  account_number: string;
  qr_image_path: string | null;
  updated_at?: string | null;
}

export function isGCashMethod(paymentMethod: string): boolean {
  return paymentMethod.trim().toLowerCase() === 'gcash';
}

export function accountNumberHint(paymentMethod: string): string {
  return isGCashMethod(paymentMethod)
    ? 'PH mobile number, e.g. 09171234567'
    : 'Bank account number, 10–19 digits';
}

export function isValidAccountNumber(paymentMethod: string, accountNumber: string): boolean {
  const digitsOnly = accountNumber.replace(/[\s-]/g, '');
  return isGCashMethod(paymentMethod) ? /^09\d{9}$/.test(digitsOnly) : /^\d{10,19}$/.test(digitsOnly);
}

export function sortPaymentMethods(rows: PaymentSettingRow[]): PaymentSettingRow[] {
  return [...rows].sort((a, b) => {
    if (isGCashMethod(a.payment_method)) return -1;
    if (isGCashMethod(b.payment_method)) return 1;
    return a.payment_method.localeCompare(b.payment_method);
  });
}

export function dropZoneClass(dragging: boolean, hasFile: boolean): string {
  if (dragging) return 'border-orange-400 bg-orange-50';
  if (hasFile) return 'border-green-300 bg-green-50';
  return 'border-gray-200 hover:border-orange-300 hover:bg-orange-50/40';
}

interface PaymentMethodCardProps {
  row: PaymentSettingRow;
  qrUrl: string | null;
  token: string;
  onSaved: (updated: PaymentSettingRow, qrUrl?: string | null) => void;
}

export function PaymentMethodCard({ row, qrUrl, token, onSaved }: Readonly<PaymentMethodCardProps>) {
  const [editing, setEditing] = useState(false);
  const [accountName, setAccountName] = useState(row.account_name);
  const [accountNumber, setAccountNumber] = useState(row.account_number);
  const [newFile, setNewFile] = useState<File | null>(null);
  const [newPreview, setNewPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const valid = accountName.trim().length > 0 && isValidAccountNumber(row.payment_method, accountNumber);

  const acceptFile = (file: File) => {
    if (!file.type.startsWith('image/')) { setError('Only image files allowed.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('File too large - max 5MB.'); return; }
    setNewFile(file);
    setNewPreview(URL.createObjectURL(file));
    setError(null);
  };

  const cancelEdit = () => {
    setEditing(false);
    setAccountName(row.account_name);
    setAccountNumber(row.account_number);
    setNewFile(null);
    if (newPreview) URL.revokeObjectURL(newPreview);
    setNewPreview(null);
    setError(null);
    setConfirming(false);
  };

  const doSave = async (qrImagePath?: string) => {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateAdminPaymentSettings({
        paymentMethod: row.payment_method,
        accountName,
        accountNumber,
        qrImagePath: qrImagePath ?? row.qr_image_path ?? undefined,
      }, token);

      let freshQrUrl: string | null | undefined;
      if (qrImagePath) {
        const { signedUrl } = await api.getSignedViewUrl(qrImagePath, undefined, undefined, token);
        freshQrUrl = signedUrl;
      }
      onSaved(
        {
          ...row,
          account_name: accountName,
          account_number: accountNumber,
          qr_image_path: qrImagePath ?? row.qr_image_path,
          updated_at: updated.updated_at,
        },
        freshQrUrl,
      );
      cancelEdit();
    } catch (err: any) {
      setError(err.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveClick = () => {
    if (!valid) return;
    if (newFile) { setConfirming(true); return; }
    void doSave();
  };

  const handleConfirmQrSave = async () => {
    if (!newFile) return;
    setSaving(true);
    setError(null);
    try {
      const { signedUrl, path } = await api.getAssetUploadUrl(newFile.name.replace(/\s+/g, '_'), token);
      await fetch(signedUrl, { method: 'PUT', body: newFile, headers: { 'Content-Type': newFile.type } });
      await doSave(path);
    } catch (err: any) {
      setError(err.message || 'Failed to upload QR.');
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between" style={{ backgroundColor: '#fafafa' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #ee4923, #F4921F)' }}>
            <QrCode className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="font-lovelo font-black text-sm" style={{ color: '#383838' }}>{row.payment_method}</p>
            <p className="font-lovelo text-[10px] text-gray-400" style={{ fontWeight: 300 }}>
              Shown to customers when they select {row.payment_method} payment
            </p>
          </div>
        </div>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)}
            className="font-lovelo flex items-center gap-2 text-xs font-black tracking-wider text-white rounded-xl px-4 py-2"
            style={{ background: 'linear-gradient(135deg, #383838, #1a1a1a)' }}>
            <ImagePlus className="w-3.5 h-3.5" /> Edit
          </button>
        )}
      </div>

      <div className="p-6">
        {!editing ? (
          <div className="flex items-start gap-6">
            <div className="w-32 h-32 flex-shrink-0 rounded-2xl border-2 border-gray-100 overflow-hidden bg-white flex items-center justify-center shadow-sm">
              {qrUrl
                ? <img src={qrUrl} alt={`${row.payment_method} QR Code`} className="w-full h-full object-contain p-2" />
                : <QrCode className="w-8 h-8 text-gray-300" />}
            </div>
            <div className="flex-1 min-w-0 pt-1 space-y-2">
              <div>
                <p className="font-lovelo text-[9px] font-black tracking-[0.2em] uppercase text-gray-400">Account Name</p>
                <p className="font-lovelo text-sm text-gray-800">{row.account_name}</p>
              </div>
              <div>
                <p className="font-lovelo text-[9px] font-black tracking-[0.2em] uppercase text-gray-400">Account Number</p>
                <p className="font-mono text-sm text-gray-800">{row.account_number}</p>
              </div>
              {row.updated_at && (
                <p className="font-lovelo text-[10px] text-gray-400 flex items-center gap-1.5 pt-1">
                  <RefreshCw className="w-3 h-3" /> Last updated: {format(new Date(row.updated_at), 'MMM d, yyyy · h:mm a')}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <label className="font-lovelo text-[9px] font-black tracking-[0.2em] uppercase text-gray-400 block mb-1">Account Name</label>
              <input type="text" value={accountName} onChange={e => setAccountName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-orange-400" />
            </div>
            <div>
              <label className="font-lovelo text-[9px] font-black tracking-[0.2em] uppercase text-gray-400 block mb-1">Account Number</label>
              <input type="text" value={accountNumber} onChange={e => setAccountNumber(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:border-orange-400" />
              <p className={cn('text-[10px] mt-1 font-lovelo', isValidAccountNumber(row.payment_method, accountNumber) ? 'text-gray-400' : 'text-red-500')}>
                {accountNumberHint(row.payment_method)}
              </p>
            </div>

            <div
              className={cn('border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all duration-200', dropZoneClass(dragging, !!newFile))}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) acceptFile(f); }}
              onClick={() => fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} type="file" className="hidden" accept="image/*"
                onChange={e => { const f = e.target.files?.[0]; if (f) acceptFile(f); }} />
              {newPreview ? (
                <div className="flex flex-col items-center gap-2">
                  <img src={newPreview} alt="New QR preview" className="w-24 h-24 object-contain rounded-xl border border-gray-200 bg-white p-1" />
                  <p className="font-lovelo text-xs text-green-600 font-black">{newFile!.name}</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="w-5 h-5 text-gray-400" />
                  <p className="font-lovelo text-xs text-gray-400">
                    {dragging ? 'Drop it here' : 'Drag & drop a new QR image, or click to browse (optional)'}
                  </p>
                </div>
              )}
            </div>

            {error && (
              <p className="font-lovelo text-[10px] text-red-500 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
              </p>
            )}

            <div className="flex items-center gap-3">
              <button type="button" onClick={handleSaveClick} disabled={!valid || saving}
                className="font-lovelo flex items-center gap-2 text-xs font-black tracking-wider text-white rounded-xl px-5 py-2.5 disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, #ee4923, #F4921F)' }}>
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save Changes
              </button>
              <button type="button" onClick={cancelEdit} disabled={saving}
                className="font-lovelo text-xs font-black tracking-wider text-gray-400 hover:text-gray-600 px-3 py-2.5">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {confirming && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 bg-amber-50 border border-amber-200">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <h3 className="font-lovelo font-black text-base mb-1" style={{ color: '#383838' }}>Update {row.payment_method} QR Code?</h3>
                <p className="font-lovelo text-xs text-gray-500">Customers will see the new QR immediately after saving.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <p className="font-lovelo text-[9px] font-black tracking-[0.2em] uppercase text-gray-400 mb-2">Current</p>
                <div className="w-full aspect-square rounded-2xl border border-gray-100 bg-gray-50 flex items-center justify-center overflow-hidden p-2">
                  {qrUrl ? <img src={qrUrl} alt="Current QR" className="w-full h-full object-contain" /> : <QrCode className="w-10 h-10 text-gray-200" />}
                </div>
              </div>
              <div className="text-center">
                <p className="font-lovelo text-[9px] font-black tracking-[0.2em] uppercase mb-2" style={{ color: '#ee4923' }}>New</p>
                <div className="w-full aspect-square rounded-2xl border-2 border-orange-200 bg-orange-50 flex items-center justify-center overflow-hidden p-2">
                  {newPreview && <img src={newPreview} alt="New QR" className="w-full h-full object-contain" />}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button type="button" onClick={handleConfirmQrSave} disabled={saving}
                className="flex-1 font-lovelo flex items-center justify-center gap-2 text-xs font-black tracking-wider text-white rounded-xl px-5 py-3 disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #ee4923, #F4921F)' }}>
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} {saving ? 'Saving…' : 'Confirm Update'}
              </button>
              <button type="button" onClick={() => setConfirming(false)} disabled={saving}
                className="font-lovelo text-xs font-black tracking-wider text-gray-400 hover:text-gray-600 px-4 py-3 disabled:opacity-40">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PaymentMethodSettings() {
  const { token } = useAuth();
  const [rows, setRows] = useState<PaymentSettingRow[]>([]);
  const [qrUrls, setQrUrls] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await api.getAdminPaymentSettings(token);
        const sorted = sortPaymentMethods(data);
        if (cancelled) return;
        setRows(sorted);
        const entries = await Promise.all(sorted.map(async (r): Promise<[string, string | null]> => {
          if (!r.qr_image_path) return [r.payment_method, null];
          try {
            const { signedUrl } = await api.getSignedViewUrl(r.qr_image_path, undefined, undefined, token);
            return [r.payment_method, signedUrl];
          } catch {
            return [r.payment_method, null];
          }
        }));
        if (!cancelled) setQrUrls(Object.fromEntries(entries));
      } catch (err: any) {
        if (!cancelled) setLoadError(err.message || 'Failed to load payment settings.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const handleSaved = (updated: PaymentSettingRow, qrUrl?: string | null) => {
    setRows(prev => sortPaymentMethods(prev.map(r => (r.payment_method === updated.payment_method ? updated : r))));
    if (qrUrl !== undefined) setQrUrls(prev => ({ ...prev, [updated.payment_method]: qrUrl }));
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="font-lovelo text-[9px] font-black tracking-[0.25em] uppercase text-gray-400 mb-0.5">Payment Settings</p>
        <h2 className="font-lovelo font-display font-black text-base" style={{ color: '#383838' }}>Shop Configuration</h2>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      )}

      {!loading && loadError && (
        <p className="font-lovelo text-xs text-red-500 flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5" /> {loadError}
        </p>
      )}

      {!loading && !loadError && token && rows.map(row => (
        <PaymentMethodCard
          key={row.payment_method}
          row={row}
          qrUrl={qrUrls[row.payment_method] ?? null}
          token={token}
          onSaved={handleSaved}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd wash-and-go-SE2 && npx vitest run components/PaymentMethodSettings.test.tsx`
Expected: PASS — all describe blocks green.

- [ ] **Step 6: Commit**

```bash
git add wash-and-go-SE2/lib/api.ts wash-and-go-SE2/components/PaymentMethodSettings.tsx wash-and-go-SE2/components/PaymentMethodSettings.test.tsx
git commit -m "feat: add generic payment method settings panel with QR upload"
```

---

### Task 4: Frontend — wire `PaymentMethodSettings` into `AdminDashboard` and remove the legacy `GcashQRSettings`

**Files:**
- Modify: `wash-and-go-SE2/components/AdminDashboard.tsx`
- Modify: `wash-and-go-SE2/components/AdminDashboard.test.tsx`

**Interfaces:**
- Consumes: `PaymentMethodSettings` default export from Task 3.

This task is kept separate from Task 3 because it's a distinct, independently reviewable change: Task 3 proves the new component works in isolation; this task proves removing the old one doesn't break the dashboard around it.

- [ ] **Step 1: Remove `GcashQRSettings` and its sub-components from `AdminDashboard.tsx`**

Delete the entire block from the `// ─── GCash QR Settings ───` comment through the end of the `GcashQRSettings` component (currently lines 322–706 — covers `QrDisplayCard`, `QrUploadForm`, `QrConfirmModal`, `dropZoneClass`, and `GcashQRSettings` itself; all now live in `PaymentMethodSettings.tsx`).

Remove the now-unused import line 14: `import { supabase } from '../lib/supabase';` (verify first with a search — nothing else in this file after the deletion references `supabase.`).

Update the icon import (line 9) to drop the four icons that were exclusive to the deleted block:

```ts
// Before:
  Settings, QrCode, ImagePlus, AlertTriangle, RefreshCw,
// After:
  Settings,
```

Add the new import near the other extracted-panel imports:

```ts
import PaymentMethodSettings from './PaymentMethodSettings';
```

Update the Settings tab render (around the old line 1866–1871):

```tsx
{activeTab === 'settings' && (
  <div className="max-w-2xl space-y-10">
    <PaymentMethodSettings />
    <ScheduleSettings />
  </div>
)}
```

- [ ] **Step 2: Update `AdminDashboard.test.tsx` to match**

Remove `QrDisplayCard`, `QrUploadForm`, `QrConfirmModal`, `dropZoneClass` from the import list at the top (they no longer exist in `AdminDashboard.tsx`).

Remove the `describe('dropZoneClass', ...)` block (lines ~144–154) and the `describe('QrDisplayCard', ...)`, `describe('QrUploadForm', ...)`, `describe('QrConfirmModal', ...)` blocks (lines ~245–330) — all now covered by `PaymentMethodSettings.test.tsx`.

Add a mock next to the existing ones, and update the explanatory comment above the container describe block:

```ts
vi.mock('./MembershipsPanel', () => ({ default: () => <div>Memberships Mock</div> }));
vi.mock('./ScheduleSettings', () => ({ default: () => <div>Schedule Settings Mock</div> }));
vi.mock('./PaymentMethodSettings', () => ({ default: () => <div>Payment Method Settings Mock</div> }));
```

```ts
// ─── Container: AdminDashboard (default export) ──────────────────────────────
// MembershipsPanel, ScheduleSettings, and PaymentMethodSettings are all mocked
// away (see top of file) — each is a separate container with its own api/auth
// dependencies, covered by its own test file. This suite exercises only
// AdminDashboard's own state/handlers: tab switching, booking filters, the
// manage-booking modal round trip, and service price editing.
```

- [ ] **Step 3: Run both frontend test files plus a full run to check for regressions**

Run: `cd wash-and-go-SE2 && npx vitest run components/AdminDashboard.test.tsx components/PaymentMethodSettings.test.tsx`
Expected: PASS.

Run: `cd wash-and-go-SE2 && npm run lint`
Expected: no errors (confirms no leftover unused imports).

- [ ] **Step 4: Commit**

```bash
git add wash-and-go-SE2/components/AdminDashboard.tsx wash-and-go-SE2/components/AdminDashboard.test.tsx
git commit -m "refactor: replace GcashQRSettings with generic PaymentMethodSettings"
```

---

### Task 5: Frontend — rename the offline fallback and update docs

**Files:**
- Modify: `wash-and-go-SE2/constants.ts`
- Modify: `wash-and-go-SE2/CLAUDE.md`

- [ ] **Step 1: Rename the fallback payment method**

In `constants.ts`, change:

```ts
export const PAYMENT_METHODS = [
  {
    id: 'gcash',
    name: 'GCash',
    number: '0917-123-4567',
    accountName: 'Wash & Go Baliwag'
  },
  {
    id: 'bdo',
    name: 'BDO Bank Transfer',
    number: '0012-3456-7890',
    accountName: 'Wash & Go Services Inc.'
  }
];
```

to:

```ts
export const PAYMENT_METHODS = [
  {
    id: 'gcash',
    name: 'GCash',
    number: '0917-123-4567',
    accountName: 'Wash & Go Baliwag'
  },
  {
    id: 'bank-transfer',
    name: 'Bank Transfer',
    number: '0012-3456-7890',
    accountName: 'Wash & Go Services Inc.'
  }
];
```

- [ ] **Step 2: Update the Settings tab description in `wash-and-go-SE2/CLAUDE.md`**

Change:
```
- **Settings** — payment methods (GCash QR etc.), default schedule, date overrides
```
to:
```
- **Settings** — `PaymentMethodSettings.tsx`: editable account name/number + QR upload per payment method (GCash, Bank Transfer); `ScheduleSettings.tsx`: default schedule, date overrides
```

- [ ] **Step 3: Run the frontend test suite once more for a full regression check**

Run: `cd wash-and-go-SE2 && npx vitest run`
Expected: PASS, no failures introduced across the whole frontend suite.

- [ ] **Step 4: Commit**

```bash
git add wash-and-go-SE2/constants.ts wash-and-go-SE2/CLAUDE.md
git commit -m "chore: rename BDO fallback to Bank Transfer"
```

---

### Task 6: Manual step — rename the existing DB row (run by the user, not automated)

This repo manages Supabase data manually (no migrations folder). After Tasks 1–5 are deployed, run this once in the Supabase SQL editor to rename the existing row so it matches what the new UI expects:

```sql
UPDATE payment_settings SET payment_method = 'Bank Transfer' WHERE payment_method ILIKE 'bdo%';
```

- [ ] Confirm in the Supabase table editor that `payment_settings` now has exactly two rows: `GCash` and `Bank Transfer`.
- [ ] Reload the admin Settings tab and confirm both cards render with their existing account name/number pre-filled.
- [ ] Upload a QR image for each method, confirm the "Confirm Update" modal shows current vs. new, save, and confirm the thumbnail updates immediately in the admin panel.
- [ ] Open the booking wizard as a customer, reach the payment step, and confirm both QR codes now render there (this is the bug this whole plan exists to fix).
- [ ] Try saving an invalid account number for each method (e.g. `12345` for GCash, letters for Bank Transfer) and confirm the inline hint turns red and Save stays disabled.
