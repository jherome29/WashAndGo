# Editable Payment Methods (GCash + Bank Transfer) with Working QR Upload

## Problem

Admin uploads a GCash QR code in Settings → Shop Configuration, but it never appears on the
customer checkout page ([PaymentForm.tsx](../../../wash-and-go-SE2/components/PaymentForm.tsx)).
Separately, there is no way for an admin to edit the GCash or bank account numbers shown to
customers, and the second payment method is hardcoded as "BDO" rather than a general
"Bank Transfer" method with its own QR support.

### Root cause

Two disconnected implementations of "payment method management" exist side by side:

1. **The real path** (already fully built end-to-end, but never wired up on the admin side):
   `payment_settings` table → `PATCH /api/admin/payment-settings`
   ([admin.service.ts](../../../wash-and-go-backend/src/admin/admin.service.ts)) →
   `GET /api/admin/payment-methods` (public) → signed URLs from the `shop-assets` bucket.
   `PaymentForm.tsx` already renders `qr_signed_url` generically for any number of methods
   returned by this endpoint. `api.getAdminPaymentSettings()` / `api.updateAdminPaymentSettings()`
   wrappers already exist in [lib/api.ts](../../../wash-and-go-SE2/lib/api.ts), and
   `StorageService.createAssetUploadUrl()` (admin-only signed upload into `shop-assets`) already
   exists in the backend — but **no controller route calls it**, so it's dead code today.
2. **The path actually running**: `GcashQRSettings` in
   [AdminDashboard.tsx](../../../wash-and-go-SE2/components/AdminDashboard.tsx) talks to Supabase
   directly from the frontend — writing to the legacy `shop_settings` table and a *public*
   bucket URL — bypassing the backend entirely.

Because admin writes go through path 2 and checkout reads go through path 1, nothing an admin
uploads ever reaches customers. The account-number-editing gap and the "BDO"-only naming are a
consequence of the same thing: the admin UI was only ever built against the legacy path, never
against the real `payment_settings` table.

## Goals

- Fix the QR bug: an admin-uploaded QR appears on checkout immediately, for both payment methods.
- Rename the "BDO" method to "Bank Transfer" everywhere (admin UI, frontend offline fallback).
- Give "Bank Transfer" the same QR upload capability GCash has.
- Let admins edit the account name and account number for both methods from Settings.
- Reject account numbers that don't look like a real PH GCash or bank number.

## Non-goals

- No UI to add a brand-new payment method (e.g., Maya) or delete an existing one. Exactly two
  rows exist (`GCash`, `Bank Transfer`) and both are edited in place.
- No bank-name selector or per-bank digit-count validation. PH bank account number lengths vary
  by bank and aren't publicly standardized enough to hardcode reliably — see "Validation rules"
  below for the chosen generic approach (confirmed with the user).
- No database migration tooling. This repo manages Supabase schema/data manually (no migrations
  folder); the one required data change (renaming the existing `BDO` row) is a single manual SQL
  statement, listed under "Manual step" below.

## Design

### 1. Backend: expose the QR upload endpoint

`StorageService.createAssetUploadUrl(fileName, userId)` already exists and is already
admin-gated (`requireAdmin()` inside the method) — it just has no route. Add one to
[storage.controller.ts](../../../wash-and-go-backend/src/storage/storage.controller.ts), mirroring
the existing `upload-url` endpoint's shape:

```
POST /api/storage/asset-upload-url?fileName=qr.png
@UseGuards(SupabaseAuthGuard)
```

Returns `{ signedUrl, path }` where `path` is `qr/<timestamp>-<filename>` in the `shop-assets`
bucket — identical contract to the existing proof-upload flow the frontend already knows how to
drive (`PUT` the file to `signedUrl`, keep `path` for the follow-up API call).

### 2. Backend: validation + sanitization in `updatePaymentSettings()`

Add a small exported helper in `admin.service.ts` (same file, same pattern as `stripHtml` being
exported from `bookings.service.ts`):

```ts
export function validateAccountNumber(paymentMethod: string, accountNumber: string): void {
  const isGCash = paymentMethod.trim().toLowerCase() === 'gcash';
  const digitsOnly = accountNumber.replace(/[\s-]/g, '');

  if (isGCash) {
    if (!/^09\d{9}$/.test(digitsOnly)) {
      throw new BadRequestException('GCash number must be a valid PH mobile number (09XXXXXXXXX)');
    }
    return;
  }
  if (!/^\d{10,19}$/.test(digitsOnly)) {
    throw new BadRequestException('Account number must be 10–19 digits');
  }
}
```

`updatePaymentSettings()` calls this before the upsert. GCash numbers are normalized to
digits-only before storage (`09XXXXXXXXX`, no formatting characters — matches how phone numbers
are normalized elsewhere in this codebase, e.g. `PaymentForm.tsx`'s phone field). Bank Transfer
numbers are stored as submitted (dashes/spaces allowed) since they're a customer-facing display
string, not a validated wire format.

`accountName` and `accountNumber` both pass through the existing `stripHtml()` import (already
used in this file for schedule-override labels) before being written — matches the project's
input-sanitization convention for any string an admin can set that later renders to customers.

Finally, add the audit log call this method is currently missing — every other admin mutation in
this file logs via `AuditLogService`; `updatePaymentSettings()` is the one gap:

```ts
void this.auditLog.log(userId, 'UPDATE_PAYMENT_SETTINGS', dto.paymentMethod, {
  accountName: dto.accountName,
  qrChanged: !!dto.qrImagePath,
});
```

### 3. Frontend: `PaymentMethodSettings.tsx` (new file, replaces `GcashQRSettings`)

Extracted into its own module — mirroring how `ScheduleSettings.tsx` and `MembershipsPanel.tsx`
already live outside `AdminDashboard.tsx` and get mocked in its container tests. This also
resolves an existing test smell: `AdminDashboard.test.tsx` currently notes `GcashQRSettings`
"can't be mocked away... its initial fetch runs for real against the chainable supabase mock"
because it's a local const in the same file. Moving it out fixes that for free.

- On mount: `api.getAdminPaymentSettings(token)` → list of `{ payment_method, account_name,
  account_number, qr_image_path, updated_at }`. Sorted so `GCash` renders first, everything else
  (i.e. `Bank Transfer`) after — stable order regardless of DB row order.
- For each row with a `qr_image_path`, fetch a signed view URL via the existing
  `api.getSignedViewUrl(path, undefined, undefined, token)` (admin token bypasses the
  ownership check in `StorageService.getSignedViewUrl()` — already true today, no backend change
  needed) to render the current QR thumbnail.
- Renders one card per row, generalizing the current `QrDisplayCard` / `QrUploadForm` /
  `QrConfirmModal` trio (props parameterized by method name/subtitle instead of hardcoded
  "GCash" strings):
  - **View mode**: QR thumbnail (or "No QR uploaded" placeholder), account name, account number,
    "Edit" button.
  - **Edit mode**: account name input, account number input (inline format hint + validation
    message matching the backend rule for that method — e.g. "Must be 09XXXXXXXXX" for GCash,
    "10–19 digits" for Bank Transfer), and the existing drag-drop QR uploader (optional — leaving
    it empty keeps the current QR). Save is disabled until the account number is valid.
  - Saving a **new QR image** keeps the existing confirm-before-replace modal (current vs. new
    side-by-side) — this project already treats replacing a customer-facing payment QR as
    worth an extra confirmation step, and that's preserved here. Saving a **name/number-only**
    edit (no new QR file) saves directly, no modal — consistent with how every other inline text
    edit in this admin dashboard (e.g. `ScheduleSettings`) behaves.
  - Save flow: if a new file was chosen, `POST /api/storage/asset-upload-url` → `PUT` to
    `signedUrl` → then `api.updateAdminPaymentSettings({ paymentMethod, accountName,
    accountNumber, qrImagePath: path }, token)`; otherwise call `updateAdminPaymentSettings`
    directly with the existing `qr_image_path`. Refresh local state + toast on success; surface
    the backend's validation message on `400`.

### 4. Frontend: rename cleanup

`constants.ts`'s offline fallback list (`{ id: 'bdo', name: 'BDO Bank Transfer' }`) is renamed to
`{ id: 'bank-transfer', name: 'Bank Transfer' }` so the fallback shown when the live API is
unreachable matches the live naming.

### 5. Manual step (not automated — run once, by the user)

This repo's DB is managed manually (no migrations folder; `CLAUDE.md` lists Supabase as a
"Manual" deploy target). Renaming the existing row is one statement, run once in the Supabase SQL
editor:

```sql
UPDATE payment_settings SET payment_method = 'Bank Transfer' WHERE payment_method ILIKE 'bdo%';
```

Historical bookings store `payment_method` as a text snapshot at booking time (like
`service_name`), so this rename doesn't retroactively change anything on past booking records.

## Validation rules (confirmed with user)

| Method | Rule | Rationale |
|---|---|---|
| GCash | `09XXXXXXXXX` — exactly 11 digits, starts with `09` | It's a mobile-linked e-wallet number; this is an unambiguous, well-known format already used elsewhere in this app (`PaymentForm.tsx`'s own phone field). |
| Bank Transfer | 10–19 digits (dashes/spaces stripped before checking) | Covers the digit-count range used across major PH banks (BDO, BPI, Metrobank, Landbank, PNB, Chinabank, UnionBank, RCBC, Security Bank, EastWest, PSBank, Maybank, AUB, DBP, Robinsons Bank) without hardcoding a specific bank's exact length — those aren't publicly standardized and can vary by account type, so a tighter per-bank rule risks rejecting legitimate numbers. |

## Testing

- Backend: new `describe('AdminService.updatePaymentSettings')` in `admin.service.spec.ts` —
  valid/invalid GCash numbers (too short, wrong prefix, letters), valid/invalid bank numbers
  (9 digits, 20 digits, letters), confirms `stripHtml()` is applied, confirms the audit log call.
- Frontend: new `PaymentMethodSettings.test.tsx` replacing the `QrDisplayCard` / `QrUploadForm` /
  `QrConfirmModal` describe blocks currently in `AdminDashboard.test.tsx`; update
  `AdminDashboard.test.tsx` to `vi.mock('./PaymentMethodSettings', ...)` like the other
  extracted panels, removing the real-supabase-mock workaround note.
- Manual QA (after deploy + the manual SQL rename): upload a GCash QR in Settings, confirm it
  renders on the booking wizard's payment step; repeat for Bank Transfer; try saving an invalid
  account number for each method and confirm the inline error blocks Save.
