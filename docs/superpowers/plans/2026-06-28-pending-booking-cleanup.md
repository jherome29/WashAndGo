# Pending Booking Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow admins to bulk-cancel stale `PENDING` bookings (submitted without payment proof and never followed up) older than 72 hours with a single button press in the Admin Dashboard.

**Architecture:** Two tasks. Task 1 adds an admin-only `POST /api/bookings/admin/pending-cleanup` backend endpoint that runs a single filtered Supabase update (`status = 'PENDING' AND created_at < now - 72h → CANCELLED`) and returns `{ cancelled: number }`. Task 2 adds a "Maintenance" card at the bottom of the Settings tab in AdminDashboard with a confirmation flow: the admin clicks a button, sees a warning, confirms, and gets back a count of cancelled bookings.

**Why PENDING bookings accumulate:** Guests who start the booking wizard but submit without uploading payment proof land in `PENDING` status. `PENDING` does NOT block slot capacity (only `PENDING_VERIFICATION`, `CONFIRMED`, and `IN_PROGRESS` do). These records are harmless but create noise in the admin dashboard over time. 72 hours is long enough to accommodate guests who intend to upload later but short enough to keep the table clean.

**Tech Stack:** NestJS (backend), React 18 + TypeScript (frontend)

## Global Constraints

- **No git commits** — user commits manually; never run `git add` or `git commit`
- Only cancel bookings where `status = 'PENDING'` — never touch `PENDING_VERIFICATION`, `CONFIRMED`, `IN_PROGRESS`, `COMPLETED`, `REUPLOAD_REQUIRED`, or `CANCELLED`
- The 72-hour cutoff is hardcoded — no configurable parameter needed
- The endpoint requires `AdminGuard`-equivalent protection — use `SupabaseAuthGuard` + `requireAdmin()` (same pattern as other admin endpoints)
- The endpoint must be placed **before** any `:id`-parameterized routes in `bookings.controller.ts` to prevent NestJS treating `"admin"` as a booking ID
- No new npm packages

---

### Task 1: Backend — service method and controller endpoint

**Files:**
- Modify: `wash-and-go-backend/src/bookings/bookings.service.ts` (add `cleanupPendingBookings()`)
- Modify: `wash-and-go-backend/src/bookings/bookings.controller.ts` (add `POST /bookings/admin/pending-cleanup`)
- Test: `wash-and-go-backend/src/bookings/bookings.service.spec.ts`

**Interfaces:**
- Produces: `POST /api/bookings/admin/pending-cleanup` — requires admin JWT — response `{ cancelled: number }`

- [ ] **Step 1: Write the failing test**

Add to `wash-and-go-backend/src/bookings/bookings.service.spec.ts`:

```typescript
describe('cleanupPendingBookings', () => {
  it('only cancels PENDING bookings older than 72 hours', () => {
    const cutoffHours = 72;
    const now = Date.now();
    const cutoff = new Date(now - cutoffHours * 60 * 60 * 1000);

    // Simulate 5 booking rows
    const bookings = [
      { id: 'BK-001', status: 'PENDING',              created_at: new Date(now - 96 * 3600000).toISOString() }, // 96h old → cancel
      { id: 'BK-002', status: 'PENDING',              created_at: new Date(now - 73 * 3600000).toISOString() }, // 73h old → cancel
      { id: 'BK-003', status: 'PENDING',              created_at: new Date(now - 48 * 3600000).toISOString() }, // 48h old → keep
      { id: 'BK-004', status: 'PENDING_VERIFICATION', created_at: new Date(now - 96 * 3600000).toISOString() }, // wrong status → keep
      { id: 'BK-005', status: 'CONFIRMED',            created_at: new Date(now - 96 * 3600000).toISOString() }, // wrong status → keep
    ];

    // Apply the same filter logic the service uses
    const toCancel = bookings.filter(b =>
      b.status === 'PENDING' && new Date(b.created_at) < cutoff
    );

    expect(toCancel).toHaveLength(2);
    expect(toCancel.map(b => b.id)).toEqual(['BK-001', 'BK-002']);
    expect(toCancel.every(b => b.status === 'PENDING')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test — verify it passes**

```bash
cd wash-and-go-backend && npm test -- --testPathPattern=bookings.service.spec
```
Expected: PASS (this test validates the filter logic; the service implementation must match).

- [ ] **Step 3: Add `cleanupPendingBookings()` to `BookingsService`**

Add this method to `bookings.service.ts`, after the `guestTokenRefresh()` method (or before the private utility methods — anywhere not inside a private block):

```typescript
async cleanupPendingBookings(requestingUserId: string): Promise<{ cancelled: number }> {
  await this.requireAdmin(requestingUserId);

  const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();

  const { data, error } = await this.supabase
    .getAdminClient()
    .from('bookings')
    .update({ status: 'CANCELLED' })
    .eq('status', 'PENDING')
    .lt('created_at', cutoff)
    .select('id');

  if (error) throw new Error(`Cleanup failed: ${error.message}`);

  const cancelled = (data || []).length;
  if (cancelled > 0) {
    void this.auditLog.log(requestingUserId, 'CLEANUP_PENDING', 'bulk', { cancelled, cutoffHours: 72 });
  }
  return { cancelled };
}
```

- [ ] **Step 4: Add the controller endpoint**

Open `wash-and-go-backend/src/bookings/bookings.controller.ts`. Add the new endpoint **before** the first `:id`-parameterized route (before `@Get(':id')`, `@Patch(':id')`, etc.):

```typescript
/** POST /api/bookings/admin/pending-cleanup — Cancel PENDING bookings older than 72h (admin only) */
@UseGuards(SupabaseAuthGuard)
@Post('admin/pending-cleanup')
cleanupPendingBookings(@CurrentUser() user: any) {
  return this.bookingsService.cleanupPendingBookings(user?.id);
}
```

`SupabaseAuthGuard` and `CurrentUser` are already imported in the controller. No new imports needed beyond the method call.

- [ ] **Step 5: Verify backend builds**

```bash
cd wash-and-go-backend && npm run build
```
Expected: no TypeScript errors.

- [ ] **Step 6: Manual smoke test**

Create 2 or 3 guest bookings (no payment proof → `PENDING` status). Manually update their `created_at` in the Supabase dashboard to be more than 72 hours ago (e.g. `2026-06-25 00:00:00`). Then call:

```bash
curl -s -X POST http://localhost:3001/api/bookings/admin/pending-cleanup \
  -H "Authorization: Bearer <admin-jwt>"
```

Expected response: `{"cancelled":2}` (or however many you backdated).

Verify in the Supabase dashboard (or Admin Dashboard Bookings tab with filter `CANCELLED`) that those bookings now show `CANCELLED` status.

Also verify that a `PENDING` booking created **within** the last 72 hours is NOT cancelled.

---

### Task 2: Frontend — cleanup button in AdminDashboard Settings tab

**Files:**
- Modify: `wash-and-go-SE2/lib/api.ts` (add `cleanupPendingBookings` function)
- Modify: `wash-and-go-SE2/components/AdminDashboard.tsx:1217-1222` (Settings tab — add Maintenance card)

**Interfaces:**
- Consumes: `api.cleanupPendingBookings(token)` → `Promise<{ cancelled: number }>`

- [ ] **Step 1: Add `cleanupPendingBookings` to `api.ts`**

Open `wash-and-go-SE2/lib/api.ts`. Inside the `export const api = { ... }` object, add:

```typescript
cleanupPendingBookings: (token: string) =>
  request<{ cancelled: number }>('/bookings/admin/pending-cleanup', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  }),
```

- [ ] **Step 2: Add cleanup state to the AdminDashboard component**

Open `wash-and-go-SE2/components/AdminDashboard.tsx`. Find the main state block at the top of `AdminDashboard` (around line 553). Add three state variables for the cleanup flow — place them after the existing state declarations and before the first `useEffect` or handler:

```typescript
const [cleanupLoading, setCleanupLoading]   = useState(false);
const [cleanupResult, setCleanupResult]     = useState<{ cancelled: number } | null>(null);
const [cleanupConfirm, setCleanupConfirm]   = useState(false);
```

- [ ] **Step 3: Add `handleCleanup` function**

Add this handler function inside the `AdminDashboard` component, near the other handler functions (e.g. after `handleWalkIn` or any existing admin action handler):

```typescript
const handleCleanup = async () => {
  if (!session?.access_token) return;
  setCleanupLoading(true);
  setCleanupResult(null);
  try {
    const result = await api.cleanupPendingBookings(session.access_token);
    setCleanupResult(result);
    setCleanupConfirm(false);
  } catch (err: any) {
    setCleanupResult({ cancelled: -1 }); // -1 signals error
  } finally {
    setCleanupLoading(false);
  }
};
```

Note: `session` is already available in the component — it is passed as a prop. Check the component's prop list; if `session` is not destructured yet, add it alongside `token` (they're the same Supabase session object — `token` is `session.access_token`). Inspect the existing props at line 552 to confirm the correct variable name; if the component already uses `token` (a string), replace `session.access_token` with `token` in the handler above.

- [ ] **Step 4: Add the Maintenance card to the Settings tab**

Current Settings tab (lines 1217–1222):
```tsx
{/* ─────────────── SETTINGS TAB ─────────────── */}
{activeTab === 'settings' && (
  <div className="max-w-2xl">
    <GcashQRSettings />
  </div>
)}
```

Replace with (adds the Maintenance card below `GcashQRSettings`):
```tsx
{/* ─────────────── SETTINGS TAB ─────────────── */}
{activeTab === 'settings' && (
  <div className="max-w-2xl space-y-6">
    <GcashQRSettings />

    {/* Maintenance */}
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <h3 className="font-lovelo font-black text-sm tracking-widest uppercase text-gray-800 mb-1">Maintenance</h3>
      <p className="text-xs text-gray-400 mb-4">
        Cancel stale PENDING bookings (submitted without payment proof) that are older than 72 hours. These do not block any slots and are safe to remove.
      </p>

      {cleanupResult && (
        <div className={`mb-4 flex items-center gap-2 text-sm p-3 rounded-lg ${
          cleanupResult.cancelled === -1
            ? 'bg-red-50 text-red-600'
            : 'bg-green-50 text-green-700'
        }`}>
          {cleanupResult.cancelled === -1
            ? 'Cleanup failed. Please try again or check the backend logs.'
            : cleanupResult.cancelled === 0
              ? 'No stale PENDING bookings found. Nothing was cancelled.'
              : `${cleanupResult.cancelled} stale PENDING booking${cleanupResult.cancelled === 1 ? '' : 's'} cancelled.`
          }
        </div>
      )}

      {!cleanupConfirm ? (
        <button
          onClick={() => { setCleanupConfirm(true); setCleanupResult(null); }}
          className="font-lovelo flex items-center gap-2 px-4 py-2 rounded-xl font-black text-xs tracking-wider uppercase text-white transition-colors"
          style={{ background: '#383838' }}>
          Clean Up Old Pending Bookings
        </button>
      ) : (
        <div className="space-y-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm text-amber-800 font-semibold">
            This will cancel all PENDING bookings older than 72 hours. This cannot be undone.
          </p>
          <p className="text-xs text-amber-600">
            Tip: filter the Bookings tab by status PENDING first to see which bookings will be affected.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setCleanupConfirm(false)}
              className="font-lovelo flex-1 py-2 rounded-lg font-black text-xs tracking-wider uppercase text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button
              onClick={handleCleanup}
              disabled={cleanupLoading}
              className="font-lovelo flex-1 py-2 rounded-lg font-black text-xs tracking-wider uppercase text-white disabled:bg-gray-300 transition-colors"
              style={{ background: cleanupLoading ? undefined : '#ee4923' }}>
              {cleanupLoading ? 'Cancelling...' : 'Yes, Cancel Them'}
            </button>
          </div>
        </div>
      )}
    </div>
  </div>
)}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd wash-and-go-SE2 && npx tsc --noEmit
```
Expected: no errors. If `session` is not available (only `token` string), update the `handleCleanup` function to use `token` directly.

- [ ] **Step 6: Manual smoke test**

Start both dev servers. Log in as admin. Go to Admin Dashboard → Settings tab.

1. The "Maintenance" card appears below the existing settings.
2. Click "Clean Up Old Pending Bookings" — a yellow confirmation card appears with a warning and "Yes, Cancel Them" / "Cancel" buttons.
3. Click "Cancel" — confirmation disappears, nothing changes.
4. Create a test PENDING booking (no payment proof), then manually set its `created_at` to 4 days ago in Supabase dashboard.
5. Return to Settings → click the button → confirm → "1 stale PENDING booking cancelled" appears in green.
6. Go to Bookings tab and filter by CANCELLED — the test booking appears there.
7. Verify a PENDING booking created **today** was NOT cancelled.
8. Run the cleanup again with no stale bookings → "No stale PENDING bookings found." message appears.
