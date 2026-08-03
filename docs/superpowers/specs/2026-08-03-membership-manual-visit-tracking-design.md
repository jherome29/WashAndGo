# Manual Car-Wash Visit Tracking for Club Wash & Go Memberships

## Problem

Club Wash & Go's "free car wash every 10th visit" and "50% off first car wash" perks
(printed on the physical membership card) only ever get recorded today when a `GROOMING`
booking transitions to `COMPLETED` in the booking system — see
`MembershipsService.onBookingCompleted()` in `wash-and-go-backend/src/memberships/memberships.service.ts`.

In practice, actual car washes are mostly walk-ins: customers show up at the salon without
creating an online booking. Those visits never touch the booking system, so the shared
`visit_count` counter on the member's `memberships` row never increments, and the "every 10th
visit" free-wash credit never gets earned for the majority of a member's real-world visits.

Admins need a manual way to record a walk-in car-wash visit against a member's account, using
the same counting/reward logic the automatic path already uses.

## Goals

- Let an admin manually increment ("+") or decrement ("−") a member's visit count from the
  existing Memberships admin panel.
- Reuse the exact counting/credit-granting math already used for booking-triggered visits, so
  the two paths never drift apart.
- "−" exists only to undo an accidental "+" click, not as a general historical-correction tool.

## Non-goals

- No change to how `FREE_WASH` / `FIRST_WASH` discounts are computed or redeemed. Those remain
  tied exclusively to online bookings via `computeDiscount()` / `onBookingCompleted()`. A manual
  visit never sets or clears `first_wash_used`, and never decrements `free_wash_credits` for
  "using" a reward — redemption for walk-ins continues to be handled by staff at the counter,
  outside the app, exactly as walk-in pricing already is today.
- No new database columns. This only ever touches the existing `memberships.visit_count` and
  `memberships.free_wash_credits` fields.
- No per-vehicle selection in the UI — `visit_count` is already shared account-wide across a
  membership's up-to-3 registered vehicles (see `docs/SYSTEM.md` §18), so a manual visit isn't
  attributed to a specific plate either.

## Design

### 1. Shared counting logic (backend)

Extract the increment math currently inlined in `onBookingCompleted()`
(`memberships.service.ts:520-526`) into one small, pure helper:

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
  // delta === -1
  const removedWasMilestone = visitCount % 10 === 0 && visitCount > 0;
  return {
    visitCount: Math.max(0, visitCount - 1),
    freeWashCredits: removedWasMilestone ? Math.max(0, freeWashCredits - 1) : freeWashCredits,
  };
}
```

`onBookingCompleted()` is refactored to call this helper instead of computing the modulo/credit
logic inline (its `FREE_WASH` redemption / `first_wash_used` handling is untouched — that's
booking-specific and outside this helper). The new manual endpoints (below) call the same
helper. One source of truth for "what does a visit do to these two numbers."

### 2. Backend API

Two new endpoints on `MembershipsController`, matching the existing action-verb style
(`/renew`, `/cancel`) rather than a generic `PATCH`:

```
POST /api/memberships/:id/visits/increment
POST /api/memberships/:id/visits/decrement
```

- `@UseGuards(SupabaseAuthGuard)` on the controller method, `requireAdmin()` inside the service
  method — the same two-layer pattern every other admin mutation in this file already follows.
- Service method loads the membership, rejects with `400` if `status !== 'ACTIVE'` (mirrors the
  UI-level restriction already implied by Renew/Cancel being hidden for non-active memberships —
  enforced server-side here since this is a new mutation).
- Calls `applyVisitDelta()`, writes the result back to the `memberships` row.
- On increment, if a new free-wash credit was granted, fires
  `void this.notifyFreeWashEarned(membership, newVisitCount)` — the same email a booking-earned
  credit already triggers, so the member gets identical treatment regardless of channel.
- Logs via `AuditLogService` (see below).

### 3. Frontend UI

A compact `−  N  +` stepper in `MembershipsPanel.tsx`, added to both the desktop table row and
the mobile card, next to the existing "Next Free Wash" column/block. Visible only when
`status === 'ACTIVE'` (same conditional pattern already used for the Cancel button). Clicking
either button calls the matching endpoint, shows a toast (e.g. "Visit added — 7/10 toward next
free wash"), and reloads the membership list — identical interaction pattern to the existing
Renew/Cancel buttons (no confirmation dialog, consistent with this panel's existing
zero-friction convention).

### 4. Audit logging

Two new audit action constants, following the existing `VERB_MEMBERSHIP_NOUN` naming used by
`RENEW_MEMBERSHIP` / `ADD_MEMBERSHIP_VEHICLE` / etc.:

- `ADD_MEMBERSHIP_VISIT`
- `REMOVE_MEMBERSHIP_VISIT`

Each logged with `{ newVisitCount, newFreeWashCredits }` via
`void this.auditLog.log(adminUserId, ACTION, membershipId, details)`, giving a record of which
admin adjusted what and when.

### 5. Edge cases / guardrails

- Both `visit_count` and `free_wash_credits` are floored at 0 — "−" can never go negative.
- Only `ACTIVE` memberships can be adjusted (UI hides the control; service rejects otherwise).
- No new rate limiting — this sits behind `SupabaseAuthGuard` + the admin check, already covered
  by the app's global authenticated-request throttle.

### 6. Testing

- Unit tests for `applyVisitDelta()` in isolation (pure function, no mocking needed): crossing a
  multiple of 10 on increment; undoing that exact crossing on decrement; flooring at 0 on both
  fields; a decrement that doesn't cross a multiple of 10 leaves credits untouched.
- Service-level regression tests confirming `onBookingCompleted()` behaves identically after
  being refactored to call the shared helper (existing test file:
  `wash-and-go-backend/src/memberships/memberships.service.spec.ts`).
- Manual QA: add a walk-in visit up to a member's 10th visit via "+", confirm the free-wash
  email fires and the panel shows the credit; click "−" immediately after and confirm both the
  count and the credit revert.
