# Manual Car-Wash Visit Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin manually log (+) or undo (−) a walk-in car-wash visit against a Club Wash & Go membership, using the exact same visit-counting/credit-granting math the booking-triggered path already uses.

**Architecture:** Extract the increment/credit math already inline in `MembershipsService.onBookingCompleted()` into a small pure helper (`applyVisitDelta`), reuse it from two new admin-only endpoints (`POST /:id/visits/increment`, `POST /:id/visits/decrement`), and add a `− N +` stepper to the existing Memberships admin panel.

**Tech Stack:** NestJS (backend), Supabase (admin client, no schema changes), React + TypeScript + Tailwind (frontend), Jest (backend unit tests).

**Spec:** `docs/superpowers/specs/2026-08-03-membership-manual-visit-tracking-design.md`

## Global Constraints

- No new database columns — only `memberships.visit_count` and `memberships.free_wash_credits` are read/written.
- `visit_count` and `free_wash_credits` are always floored at 0; never negative.
- `FREE_WASH` / `FIRST_WASH` discount computation and redemption (`first_wash_used`, credit redemption tied to a booking's `membership_discount_type`) are untouched by this feature — manual visits never touch `first_wash_used` and never redeem a credit, only grant one on a multiple-of-10.
- Only `ACTIVE` memberships can have visits adjusted (server-enforced, not just UI-hidden).
- Every new admin mutation follows the existing two-layer guard: `@UseGuards(SupabaseAuthGuard)` on the controller method + `requireAdmin(adminUserId)` inside the service method.
- Every new admin mutation is logged via `AuditLogService.log(adminUserId, action, targetId, details)`.
- Frontend interaction matches the panel's existing zero-friction convention: one click, a toast, list refresh — no confirmation dialogs (this is the existing pattern for Renew/Cancel in `MembershipsPanel.tsx`).

---

### Task 1: Extract `applyVisitDelta()` helper and refactor `onBookingCompleted()`

**Files:**
- Modify: `wash-and-go-backend/src/memberships/memberships.service.ts`
- Test: `wash-and-go-backend/src/memberships/memberships.service.spec.ts`

**Interfaces:**
- Produces: `private applyVisitDelta(visitCount: number, freeWashCredits: number, delta: 1 | -1): { visitCount: number; freeWashCredits: number }` on `MembershipsService` — Task 2 calls this directly.

This task only touches the increment math already covered by the existing `MembershipsService.onBookingCompleted` describe block (lines 214-358 of the spec file) — that whole suite must still pass unchanged afterward. No new booking-path behavior is introduced here.

- [ ] **Step 1: Write the failing unit tests for the new helper**

Add this new `describe` block to `wash-and-go-backend/src/memberships/memberships.service.spec.ts`, directly after the closing `});` of the `MembershipsService.generateMembershipNo` describe block (the one ending around line 47, right before `function makePlateSupabase(...)`):

```ts
describe('MembershipsService.applyVisitDelta', () => {
  function makeService() {
    const supabase = { getAdminClient: jest.fn() };
    const auditLog = { log: jest.fn() };
    const emailService = {};
    return new MembershipsService(supabase as any, auditLog as any, emailService as any);
  }

  it('increments visit count on delta +1', () => {
    const svc = makeService();
    const result = (svc as any).applyVisitDelta(3, 0, 1);
    expect(result).toEqual({ visitCount: 4, freeWashCredits: 0 });
  });

  it('grants a free-wash credit when crossing a multiple of 10 on increment', () => {
    const svc = makeService();
    const result = (svc as any).applyVisitDelta(9, 0, 1);
    expect(result).toEqual({ visitCount: 10, freeWashCredits: 1 });
  });

  it('does not grant a credit when the increment does not cross a multiple of 10', () => {
    const svc = makeService();
    const result = (svc as any).applyVisitDelta(10, 1, 1);
    expect(result).toEqual({ visitCount: 11, freeWashCredits: 1 });
  });

  it('decrements visit count on delta -1', () => {
    const svc = makeService();
    const result = (svc as any).applyVisitDelta(5, 0, -1);
    expect(result).toEqual({ visitCount: 4, freeWashCredits: 0 });
  });

  it('removes the credit that was granted when undoing the visit that crossed a multiple of 10', () => {
    const svc = makeService();
    const result = (svc as any).applyVisitDelta(10, 1, -1);
    expect(result).toEqual({ visitCount: 9, freeWashCredits: 0 });
  });

  it('does not remove a credit when the visit being removed was not a milestone', () => {
    const svc = makeService();
    const result = (svc as any).applyVisitDelta(11, 1, -1);
    expect(result).toEqual({ visitCount: 10, freeWashCredits: 1 });
  });

  it('floors visit count at 0', () => {
    const svc = makeService();
    const result = (svc as any).applyVisitDelta(0, 0, -1);
    expect(result).toEqual({ visitCount: 0, freeWashCredits: 0 });
  });

  it('floors free-wash credits at 0 even when undoing a milestone with no credits left', () => {
    const svc = makeService();
    const result = (svc as any).applyVisitDelta(10, 0, -1);
    expect(result).toEqual({ visitCount: 9, freeWashCredits: 0 });
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `cd wash-and-go-backend && npx jest memberships.service.spec.ts -t "applyVisitDelta"`
Expected: FAIL — `applyVisitDelta` is not a function (it doesn't exist on `MembershipsService` yet).

- [ ] **Step 3: Implement `applyVisitDelta()`**

In `wash-and-go-backend/src/memberships/memberships.service.ts`, add this new private method directly after the `cancel()` method (right after its closing `}` at line 154, before the `/** Cron entry point ... */` comment on line 156):

```ts
  private applyVisitDelta(
    visitCount: number,
    freeWashCredits: number,
    delta: 1 | -1,
  ): { visitCount: number; freeWashCredits: number } {
    if (delta === 1) {
      const newVisitCount = visitCount + 1;
      const earnedFreeWash = newVisitCount % 10 === 0;
      return {
        visitCount: newVisitCount,
        freeWashCredits: earnedFreeWash ? freeWashCredits + 1 : freeWashCredits,
      };
    }
    const removedWasMilestone = visitCount > 0 && visitCount % 10 === 0;
    return {
      visitCount: Math.max(0, visitCount - 1),
      freeWashCredits: removedWasMilestone ? Math.max(0, freeWashCredits - 1) : freeWashCredits,
    };
  }
```

- [ ] **Step 4: Run the new tests to verify they pass**

Run: `cd wash-and-go-backend && npx jest memberships.service.spec.ts -t "applyVisitDelta"`
Expected: PASS (8 tests)

- [ ] **Step 5: Refactor `onBookingCompleted()` to call the helper**

In `wash-and-go-backend/src/memberships/memberships.service.ts`, find this exact block (currently lines 520-523):

```ts
      const newVisitCount = membership.visit_count + 1;
      let newFreeWashCredits = membership.free_wash_credits;
      const earnedFreeWash = newVisitCount % 10 === 0;
      if (earnedFreeWash) newFreeWashCredits += 1;
```

Replace it with:

```ts
      const { visitCount: newVisitCount, freeWashCredits: creditsAfterEarning } = this.applyVisitDelta(
        membership.visit_count,
        membership.free_wash_credits,
        1,
      );
      const earnedFreeWash = newVisitCount % 10 === 0;
      let newFreeWashCredits = creditsAfterEarning;
```

Everything below this block (the `FREE_WASH` redemption check, `newFirstWashUsed`, the DB update, audit log, and `notifyFreeWashEarned` call) stays exactly as-is — this refactor only changes where the increment/credit-earning math is computed, not the FREE_WASH/FIRST_WASH handling around it.

- [ ] **Step 6: Run the full existing `onBookingCompleted` suite to confirm no regression**

Run: `cd wash-and-go-backend && npx jest memberships.service.spec.ts -t "onBookingCompleted"`
Expected: PASS — all pre-existing tests in that describe block (does-nothing cases, ordinary increment, 10th-visit credit grant + email, FREE_WASH redemption, negative-credit floor, FIRST_WASH flip, non-GROOMING no-op) must pass unchanged.

- [ ] **Step 7: Run the full backend test suite**

Run: `cd wash-and-go-backend && npm test`
Expected: PASS — no other suite should be affected by this change.

- [ ] **Step 8: Commit**

```bash
git add wash-and-go-backend/src/memberships/memberships.service.ts wash-and-go-backend/src/memberships/memberships.service.spec.ts
git commit -m "refactor: extract applyVisitDelta helper from onBookingCompleted"
```

---

### Task 2: Add `incrementVisit()` / `decrementVisit()` service methods

**Files:**
- Modify: `wash-and-go-backend/src/memberships/memberships.service.ts`
- Test: `wash-and-go-backend/src/memberships/memberships.service.spec.ts`

**Interfaces:**
- Consumes: `this.applyVisitDelta(visitCount, freeWashCredits, delta)` from Task 1; `this.requireAdmin(adminUserId)`, `this.toMembership(row, vehicles)`, `this.getVehicles(id)`, `this.notifyFreeWashEarned(membership, visitCount)` (all pre-existing on `MembershipsService`).
- Produces: `async incrementVisit(id: string, adminUserId: string)` and `async decrementVisit(id: string, adminUserId: string)` on `MembershipsService`, both returning the same shape as `renew()`/`cancel()` (a `toMembership(...)` object) — Task 3's controller calls these directly.

- [ ] **Step 1: Write the failing unit tests**

Add `BadRequestException` to the existing import at the top of `wash-and-go-backend/src/memberships/memberships.service.spec.ts` (currently `import { ForbiddenException } from '@nestjs/common';` near the top) so it reads:

```ts
import { ForbiddenException, BadRequestException } from '@nestjs/common';
```

Then add this new `describe` block directly after the closing `});` of the `MembershipsService.onBookingCompleted` describe block (the one ending at line 358, right before `describe('MembershipsService admin guard', ...)`):

```ts
describe('MembershipsService.incrementVisit / decrementVisit', () => {
  function makeAdjustSupabase(membershipRow: any) {
    const updateCalls: { table: string; payload: any }[] = [];
    let currentRow = { ...membershipRow };
    const from = jest.fn((table: string) => {
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { role: 'admin' } }) }) }) };
      }
      if (table === 'memberships') {
        return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: currentRow }) }) }),
          update: (payload: any) => {
            updateCalls.push({ table, payload });
            currentRow = { ...currentRow, ...payload };
            return { eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: currentRow, error: null }) }) }) };
          },
        };
      }
      if (table === 'membership_vehicles') {
        return { select: () => ({ eq: () => Promise.resolve({ data: [] }) }) };
      }
      throw new Error(`Unexpected table ${table}`);
    });
    return {
      supabase: {
        getAdminClient: jest.fn().mockReturnValue({
          from,
          auth: { admin: { getUserById: jest.fn().mockResolvedValue({ data: { user: { email: 'member@example.com' } } }) } },
        }),
      },
      updateCalls,
    };
  }

  const baseRow = { id: 'm1', status: 'ACTIVE', member_name: 'Juan', membership_no: 'CWG-000001', user_id: 'u1' };

  it('incrementVisit() bumps visit_count by 1 for an active membership', async () => {
    const { supabase, updateCalls } = makeAdjustSupabase({ ...baseRow, visit_count: 3, free_wash_credits: 0 });
    const auditLog = { log: jest.fn() };
    const svc = new MembershipsService(supabase as any, auditLog as any, mockEmailService as any);

    const result = await svc.incrementVisit('m1', 'admin-1');

    expect(updateCalls[0].payload).toEqual({ visit_count: 4, free_wash_credits: 0 });
    expect(result.visitCount).toBe(4);
    expect(auditLog.log).toHaveBeenCalledWith('admin-1', 'ADD_MEMBERSHIP_VISIT', 'm1', { newVisitCount: 4, newFreeWashCredits: 0 });
    expect(mockEmailService.sendFreeWashEarnedEmail).not.toHaveBeenCalled();
  });

  it('incrementVisit() grants a credit and sends the free-wash email on the 10th visit', async () => {
    const { supabase } = makeAdjustSupabase({ ...baseRow, visit_count: 9, free_wash_credits: 0 });
    const svc = new MembershipsService(supabase as any, { log: jest.fn() } as any, mockEmailService as any);

    await svc.incrementVisit('m1', 'admin-1');
    await new Promise(resolve => setImmediate(resolve)); // flush the fire-and-forget notify call

    expect(mockEmailService.sendFreeWashEarnedEmail).toHaveBeenCalledWith({
      to: 'member@example.com',
      memberName: 'Juan',
      membershipNo: 'CWG-000001',
      visitCount: 10,
    });
  });

  it('decrementVisit() undoes an accidental increment, including the just-granted credit', async () => {
    const { supabase, updateCalls } = makeAdjustSupabase({ ...baseRow, visit_count: 10, free_wash_credits: 1 });
    const auditLog = { log: jest.fn() };
    const svc = new MembershipsService(supabase as any, auditLog as any, mockEmailService as any);

    const result = await svc.decrementVisit('m1', 'admin-1');

    expect(updateCalls[0].payload).toEqual({ visit_count: 9, free_wash_credits: 0 });
    expect(result.freeWashCredits).toBe(0);
    expect(auditLog.log).toHaveBeenCalledWith('admin-1', 'REMOVE_MEMBERSHIP_VISIT', 'm1', { newVisitCount: 9, newFreeWashCredits: 0 });
  });

  it('decrementVisit() never goes below 0', async () => {
    const { supabase, updateCalls } = makeAdjustSupabase({ ...baseRow, visit_count: 0, free_wash_credits: 0 });
    const svc = new MembershipsService(supabase as any, { log: jest.fn() } as any, mockEmailService as any);

    const result = await svc.decrementVisit('m1', 'admin-1');

    expect(updateCalls[0].payload).toEqual({ visit_count: 0, free_wash_credits: 0 });
    expect(result.visitCount).toBe(0);
  });

  it('rejects with BadRequestException when the membership is not ACTIVE', async () => {
    const { supabase } = makeAdjustSupabase({ ...baseRow, status: 'CANCELLED', visit_count: 3, free_wash_credits: 0 });
    const svc = new MembershipsService(supabase as any, { log: jest.fn() } as any, mockEmailService as any);

    await expect(svc.incrementVisit('m1', 'admin-1')).rejects.toThrow(BadRequestException);
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `cd wash-and-go-backend && npx jest memberships.service.spec.ts -t "incrementVisit / decrementVisit"`
Expected: FAIL — `svc.incrementVisit` / `svc.decrementVisit` are not functions yet.

- [ ] **Step 3: Implement `incrementVisit()`, `decrementVisit()`, and the shared `adjustVisit()`**

In `wash-and-go-backend/src/memberships/memberships.service.ts`, add these three methods directly after the `applyVisitDelta()` method added in Task 1:

```ts
  async incrementVisit(id: string, adminUserId: string) {
    return this.adjustVisit(id, adminUserId, 1);
  }

  async decrementVisit(id: string, adminUserId: string) {
    return this.adjustVisit(id, adminUserId, -1);
  }

  private async adjustVisit(id: string, adminUserId: string, delta: 1 | -1) {
    await this.requireAdmin(adminUserId);

    const { data: existing } = await this.supabase
      .getAdminClient()
      .from('memberships')
      .select('*')
      .eq('id', id)
      .single();
    if (!existing) throw new NotFoundException(`Membership ${id} not found`);
    if (existing.status !== 'ACTIVE') {
      throw new BadRequestException('Only active memberships can have visits adjusted');
    }

    const { visitCount, freeWashCredits } = this.applyVisitDelta(
      existing.visit_count,
      existing.free_wash_credits,
      delta,
    );
    const earnedFreeWash = delta === 1 && freeWashCredits > existing.free_wash_credits;

    const { data, error } = await this.supabase
      .getAdminClient()
      .from('memberships')
      .update({ visit_count: visitCount, free_wash_credits: freeWashCredits })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);

    void this.auditLog.log(
      adminUserId,
      delta === 1 ? 'ADD_MEMBERSHIP_VISIT' : 'REMOVE_MEMBERSHIP_VISIT',
      id,
      { newVisitCount: visitCount, newFreeWashCredits: freeWashCredits },
    );
    if (earnedFreeWash) void this.notifyFreeWashEarned(data, visitCount);

    return this.toMembership(data, await this.getVehicles(id));
  }
```

- [ ] **Step 4: Run the new tests to verify they pass**

Run: `cd wash-and-go-backend && npx jest memberships.service.spec.ts -t "incrementVisit / decrementVisit"`
Expected: PASS (5 tests)

- [ ] **Step 5: Run the full backend test suite**

Run: `cd wash-and-go-backend && npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add wash-and-go-backend/src/memberships/memberships.service.ts wash-and-go-backend/src/memberships/memberships.service.spec.ts
git commit -m "feat: add incrementVisit/decrementVisit for manual walk-in visit tracking"
```

---

### Task 3: Wire the two new endpoints into `MembershipsController`

**Files:**
- Modify: `wash-and-go-backend/src/memberships/memberships.controller.ts`

**Interfaces:**
- Consumes: `this.membershipsService.incrementVisit(id, user.id)` and `.decrementVisit(id, user.id)` from Task 2.
- Produces: `POST /api/memberships/:id/visits/increment` and `POST /api/memberships/:id/visits/decrement` — Task 4's frontend API client calls these two routes directly.

- [ ] **Step 1: Add the two controller methods**

In `wash-and-go-backend/src/memberships/memberships.controller.ts`, insert these two methods directly after the `cancel()` method (after its closing `}` at line 91, before the `/** POST /api/memberships/:id/vehicles ... */` comment on line 93):

```ts
  /** POST /api/memberships/:id/visits/increment — Admin logs a walk-in car-wash visit */
  @UseGuards(SupabaseAuthGuard)
  @Post(':id/visits/increment')
  incrementVisit(@Param('id') id: string, @CurrentUser() user: any) {
    return this.membershipsService.incrementVisit(id, user.id);
  }

  /** POST /api/memberships/:id/visits/decrement — Admin undoes an accidental visit log */
  @UseGuards(SupabaseAuthGuard)
  @Post(':id/visits/decrement')
  decrementVisit(@Param('id') id: string, @CurrentUser() user: any) {
    return this.membershipsService.decrementVisit(id, user.id);
  }
```

- [ ] **Step 2: Verify the backend builds and all tests still pass**

Run: `cd wash-and-go-backend && npm run build && npm test`
Expected: build succeeds with no TypeScript errors; all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add wash-and-go-backend/src/memberships/memberships.controller.ts
git commit -m "feat: expose increment/decrement visit endpoints on MembershipsController"
```

---

### Task 4: Frontend — API client functions + `− N +` stepper in `MembershipsPanel.tsx`

**Files:**
- Modify: `wash-and-go-SE2/lib/api.ts`
- Modify: `wash-and-go-SE2/components/MembershipsPanel.tsx`

**Interfaces:**
- Consumes: `POST /api/memberships/:id/visits/increment` and `.../decrement` from Task 3.
- Produces: `api.addMembershipVisit(id, token)` and `api.removeMembershipVisit(id, token)` in `lib/api.ts`, both returning `Promise<Membership>` — consumed only within this same task's UI handlers.

- [ ] **Step 1: Add the API client functions**

In `wash-and-go-SE2/lib/api.ts`, insert directly after `cancelMembership` (after this existing block, currently at lines 265-266):

```ts
  cancelMembership: (id: string, token: string) =>
    request<Membership>(`/memberships/${id}/cancel`, { method: 'POST', headers: authHeaders(token) }),
```

add:

```ts
  addMembershipVisit: (id: string, token: string) =>
    request<Membership>(`/memberships/${id}/visits/increment`, { method: 'POST', headers: authHeaders(token) }),

  removeMembershipVisit: (id: string, token: string) =>
    request<Membership>(`/memberships/${id}/visits/decrement`, { method: 'POST', headers: authHeaders(token) }),
```

- [ ] **Step 2: Verify the frontend still type-checks**

Run: `cd wash-and-go-SE2 && npm run lint`
Expected: no new errors.

- [ ] **Step 3: Add the `Minus` icon import and the handler functions**

In `wash-and-go-SE2/components/MembershipsPanel.tsx`, change the existing lucide-react import (currently lines 3-6):

```ts
import {
  Search, Plus, X, Trash2, Loader2, CheckCircle2, AlertCircle,
  IdCard, Car, RefreshCw, Ban, Gift, ArrowLeft, UserPlus, Droplets,
} from 'lucide-react';
```

to:

```ts
import {
  Search, Plus, Minus, X, Trash2, Loader2, CheckCircle2, AlertCircle,
  IdCard, Car, RefreshCw, Ban, Gift, ArrowLeft, UserPlus, Droplets,
} from 'lucide-react';
```

Then add these two handler functions directly after the `cancel` function (after its closing `};` at line 456, before the `openManage` function on line 458):

```ts
  const addVisit = async (m: Membership) => {
    if (!token) return;
    setActioningId(m.id);
    try {
      const updated = await api.addMembershipVisit(m.id, token);
      setToast({ msg: `Visit logged for ${updated.membershipNo}.`, ok: true });
      await load();
    } catch (err: any) {
      setToast({ msg: err?.message || 'Failed to log visit.', ok: false });
    } finally {
      setActioningId(null);
    }
  };

  const removeVisit = async (m: Membership) => {
    if (!token) return;
    setActioningId(m.id);
    try {
      await api.removeMembershipVisit(m.id, token);
      setToast({ msg: `Visit removed for ${m.membershipNo}.`, ok: true });
      await load();
    } catch (err: any) {
      setToast({ msg: err?.message || 'Failed to remove visit.', ok: false });
    } finally {
      setActioningId(null);
    }
  };
```

- [ ] **Step 4: Add the stepper to the mobile card**

In `wash-and-go-SE2/components/MembershipsPanel.tsx`, find this exact block inside the mobile card rendering (currently lines 568-578):

```tsx
                      <div>
                        <p className="font-lovelo text-[9px] font-black tracking-widest uppercase text-gray-400 mb-1">Next Free Wash</p>
                        {m.freeWashCredits > 0 ? (
                          <span className="font-lovelo text-[10px] font-black flex items-center gap-1 px-2 py-0.5 rounded-full w-fit" style={{ backgroundColor: '#fef3c7', color: '#92400e' }}>
                            <Gift className="w-3 h-3" /> {m.freeWashCredits} free wash{m.freeWashCredits !== 1 ? 'es' : ''} ready
                          </span>
                        ) : (
                          <span className="font-lovelo text-[10px] text-gray-400" style={{ fontWeight: 300 }}>{visitsIntoCycle}/10 visits</span>
                        )}
                      </div>
```

Replace it with:

```tsx
                      <div>
                        <p className="font-lovelo text-[9px] font-black tracking-widest uppercase text-gray-400 mb-1">Next Free Wash</p>
                        <div className="flex items-center gap-2">
                          {m.freeWashCredits > 0 ? (
                            <span className="font-lovelo text-[10px] font-black flex items-center gap-1 px-2 py-0.5 rounded-full w-fit" style={{ backgroundColor: '#fef3c7', color: '#92400e' }}>
                              <Gift className="w-3 h-3" /> {m.freeWashCredits} free wash{m.freeWashCredits !== 1 ? 'es' : ''} ready
                            </span>
                          ) : (
                            <span className="font-lovelo text-[10px] text-gray-400" style={{ fontWeight: 300 }}>{visitsIntoCycle}/10 visits</span>
                          )}
                          {m.status === 'ACTIVE' && (
                            <div className="flex items-center gap-1">
                              <button type="button" onClick={() => removeVisit(m)} disabled={actioningId === m.id} title="Remove a walk-in visit"
                                className="w-6 h-6 flex items-center justify-center rounded-lg border border-gray-200 bg-white disabled:opacity-40">
                                <Minus className="w-3 h-3 text-gray-500" />
                              </button>
                              <span className="font-lovelo text-[10px] font-black text-gray-500 w-4 text-center">{m.visitCount}</span>
                              <button type="button" onClick={() => addVisit(m)} disabled={actioningId === m.id} title="Log a walk-in visit"
                                className="w-6 h-6 flex items-center justify-center rounded-lg border border-gray-200 bg-white disabled:opacity-40">
                                <Plus className="w-3 h-3 text-gray-500" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
```

- [ ] **Step 5: Add the stepper to the desktop table**

In the same file, find this exact block inside the desktop table rendering (currently lines 638-648):

```tsx
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          {m.freeWashCredits > 0 ? (
                            <span className="font-lovelo text-[10px] font-black flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ backgroundColor: '#fef3c7', color: '#92400e' }}>
                              <Gift className="w-3 h-3" /> {m.freeWashCredits} free wash{m.freeWashCredits !== 1 ? 'es' : ''} ready
                            </span>
                          ) : (
                            <span className="font-lovelo text-[10px] text-gray-400" style={{ fontWeight: 300 }}>{visitsIntoCycle}/10 visits</span>
                          )}
                        </div>
                      </td>
```

Replace it with:

```tsx
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          {m.freeWashCredits > 0 ? (
                            <span className="font-lovelo text-[10px] font-black flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ backgroundColor: '#fef3c7', color: '#92400e' }}>
                              <Gift className="w-3 h-3" /> {m.freeWashCredits} free wash{m.freeWashCredits !== 1 ? 'es' : ''} ready
                            </span>
                          ) : (
                            <span className="font-lovelo text-[10px] text-gray-400" style={{ fontWeight: 300 }}>{visitsIntoCycle}/10 visits</span>
                          )}
                          {m.status === 'ACTIVE' && (
                            <div className="flex items-center gap-1 ml-1">
                              <button type="button" onClick={() => removeVisit(m)} disabled={actioningId === m.id} title="Remove a walk-in visit"
                                className="w-6 h-6 flex items-center justify-center rounded-lg border border-gray-200 hover:border-red-300 bg-white disabled:opacity-40">
                                <Minus className="w-3 h-3 text-gray-500" />
                              </button>
                              <span className="font-lovelo text-[10px] font-black text-gray-500 w-4 text-center">{m.visitCount}</span>
                              <button type="button" onClick={() => addVisit(m)} disabled={actioningId === m.id} title="Log a walk-in visit"
                                className="w-6 h-6 flex items-center justify-center rounded-lg border border-gray-200 hover:border-orange-300 bg-white disabled:opacity-40">
                                <Plus className="w-3 h-3 text-gray-500" />
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
```

- [ ] **Step 6: Verify the frontend type-checks and lints clean**

Run: `cd wash-and-go-SE2 && npm run lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add wash-and-go-SE2/lib/api.ts wash-and-go-SE2/components/MembershipsPanel.tsx
git commit -m "feat: add manual visit +/- stepper to Memberships admin panel"
```

---

### Task 5: Manual end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Start both dev servers**

Run from repo root: `npm run dev`
Expected: backend on `http://localhost:3001/api`, frontend on `http://localhost:3000`.

- [ ] **Step 2: Log in as an admin and open the Memberships tab**

In the browser, log in with an admin account, go to the Admin Dashboard → Memberships tab. Confirm the `− N +` stepper appears next to "Next Free Wash" for any `ACTIVE` membership, and does **not** appear for any `CANCELLED` or `EXPIRED` membership.

- [ ] **Step 3: Verify the increment path, including the 10th-visit milestone**

Pick (or issue a test membership at) a member sitting at visit count 9. Click "+". Confirm:
- A success toast appears.
- The count updates to 10 and the row switches to the "free wash ready" banner (since `free_wash_credits` is now 1).
- The backend log shows the `notifyFreeWashEarned` email attempt (or, if `BREVO_API_KEY` isn't configured in your local `.env`, a `logger.warn` line — this is expected per the existing fire-and-forget email pattern, not a bug).

- [ ] **Step 4: Verify the decrement path undoes the milestone correctly**

On the same membership (now at visit 10, 1 credit), click "−". Confirm:
- A success toast appears.
- The count reverts to 9 and the "free wash ready" banner disappears, back to the "9/10 visits" progress display.

- [ ] **Step 5: Verify the floor at 0**

Find or create a test membership at visit count 0. Click "−" once. Confirm no error occurs and the count stays at 0.

- [ ] **Step 6: Run the full test suites one more time**

Run: `cd wash-and-go-backend && npm test`
Run: `cd wash-and-go-SE2 && npm run lint`
Expected: both PASS with no errors.

- [ ] **Step 7: Final commit (if any QA-driven fixes were needed)**

If steps 1-6 required any code changes, commit them now with a message describing what was fixed. If no changes were needed, skip this step — the feature is complete as of Task 4's commit.
