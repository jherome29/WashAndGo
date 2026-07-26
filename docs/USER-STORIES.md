# Manual Testing Guide — User Stories & Journeys

Checklist-style scenarios for manually verifying the system in a browser. Organized by persona, then by combinatorial matrices (pricing, status visibility, emails) so every meaningful combination — not just one representative example — gets a checkbox. Check off (`- [x]`) as you go, or copy this file per test pass.

**Environments referenced:**
- Frontend: `http://localhost:3000` (dev) / `https://wash-and-go-front-back.pages.dev` (prod)
- Backend: `http://localhost:3001/api` (dev) / `https://wash-and-go-front-back-production.up.railway.app/api` (prod)
- Admin dashboard: log in with an account whose `profiles.role = 'admin'`

For system logic behind any scenario, see [docs/SYSTEM.md](SYSTEM.md).

---

## Table of Contents

1. Guest Customer Journeys (no account)
2. Registered Customer Journeys
3. Admin Journeys
4. Membership (Club Wash & Go) — Admin side
5. Admin Customer Search
6. Service × Vehicle × Pricing Combination Matrix
7. Booking Status — Per-Role Visibility Matrix
8. Email Notification Matrix (every template)
9. Slot Availability & Capacity (incl. boundary conditions)
10. Schedule Management
11. File Upload Edge Cases
12. Security & Abuse — Field-by-Field Injection Matrix
13. Concurrency & Race Conditions
14. Empty States
15. Admin Audit Log — Every Action Type
16. Cross-Cutting / Environment Checks

---

## 1. Guest Customer Journeys (no account)

### 1.1 Guest booking creation
- [ ] Land on Home page → "Book Now" → wizard opens without being redirected to login (guest gate was removed — Plan A).
- [ ] Step 1 (Service Selection): pick a service → proceeds to Step 2.
- [ ] Step 2 (Vehicle Selection): enter vehicle type (Car/Motorcycle), vehicle size, plate number.
- [ ] Step 3 (Fuel Type — LUBE only): select GAS or DIESEL. Confirm this step is **skipped** entirely when the chosen service is GROOMING or COATING.
- [ ] Step 4 (Schedule Selection): calendar shows available dates; closed dates (see §10) are greyed out with a reason on hover/click.
- [ ] Pick a date → time slots load for that date, 1-hour increments from open→close.
- [ ] Step 5 (Payment Form): enter name, phone (`09XXXXXXXXX` format enforced), email. Upload a payment proof screenshot (jpg/png/webp).
- [ ] Submit → booking is created with status **PENDING_VERIFICATION** (since proof was attached).
- [ ] Confirmation screen shows the **Booking ID** (`BK-######`) and mentions a status token was emailed — no token entry required in the UI.
- [ ] Confirmation email arrives (`sendBookingCreatedCustomerEmail`) with Booking ID and next steps — see §8.
- [ ] Admin notification email arrives at every address in `ADMIN_NOTIFICATION_EMAILS` (`sendBookingCreatedAdminEmail`).

### 1.2 Guest booking without payment proof
- [ ] Go through the wizard but skip the proof upload if the UI allows submitting without one.
- [ ] Booking is created with status **PENDING** (not PENDING_VERIFICATION) — no proof means it just waits.

### 1.3 Guest booking with no email provided
- [ ] If the UI allows submitting without an email, confirm no customer-facing email is attempted (`sendBookingCreatedCustomerEmail` only fires "if email exists" per system docs) and no crash occurs — the booking still gets created and is retrievable by Booking ID.

### 1.4 Guest status check
- [ ] Navbar shows "Check Status" (not "My Bookings") when logged out.
- [ ] Enter the Booking ID from §1.1 → booking details load (status, service, schedule, price breakdown).
- [ ] Enter a nonexistent/garbage Booking ID → clean "not found" message, no stack trace or raw error leaks.
- [ ] Enter a well-formed but wrong-checksum-looking Booking ID (e.g. flip one digit of a real one) → still "not found," not a crash or a partial match.
- [ ] Confirm the page **polls every ~10s** and updates automatically if an admin changes status while it's open (open two tabs: one as guest status page, one as admin — confirm/decline in admin tab, watch guest tab update).

### 1.5 Guest membership lookup
- [ ] On the Check Status page, switch to the "Membership" tab (`MembershipLookup`).
- [ ] Enter a valid `CWG-NNNNNN` membership number → member's status, visit progress, and vehicle list display.
- [ ] Enter an invalid/nonexistent membership number → clean error, no data leaked.
- [ ] Enter a membership number in the wrong format entirely (e.g. `12345`, `CWG123`, `cwg-123456` lowercase, `CWG-12` too short, `CWG-1234567` too long) → all rejected/not-found cleanly, no 500 errors.
- [ ] **Regression — enumeration fix:** try a few sequential numbers near a known valid one (e.g. valid is `CWG-483920`, try `CWG-483921`, `CWG-483919`, and `CWG-000001`) → all should return "not found." Membership numbers are now random, not sequential, so adjacent/low numbers must not resolve to real accounts.
- [ ] Rate-limit check: hit the lookup endpoint 11+ times in a minute → throttled (10/min).

### 1.6 Guest email-already-exists nudge
- [ ] During Step 5, enter an email that already belongs to a registered account.
- [ ] On submit, a blocking modal should appear suggesting the guest log in instead (via `POST /api/auth/check-email`), rather than silently creating a duplicate/orphaned guest booking.
- [ ] Enter an email that does **not** belong to any account → no modal, booking proceeds normally.
- [ ] Enter a malformed email (`not-an-email`) → client-side validation blocks submission before the check-email call even fires.

### 1.7 Guest re-upload flow
- [ ] Have an admin decline a guest booking's payment proof (see §3.3) with a reason.
- [ ] Using the guest's Booking ID on the status page, confirm status shows **REUPLOAD_REQUIRED** with the decline reason visible.
- [ ] Re-upload a new payment proof screenshot from the status page.
- [ ] Status flips to **REUPLOAD_SUBMITTED** and the slot remains held (capacity still consumed).
- [ ] Confirm a **new** status token was issued behind the scenes (not user-visible, but verify old email links/tokens for this booking no longer work if you have access to test that).
- [ ] Try to re-upload on a booking that is **not** in REUPLOAD_REQUIRED (e.g. still PENDING_VERIFICATION, or already CONFIRMED) → rejected — the status check is the auth gate for this action.
- [ ] Admin declines the **re-uploaded** proof a second time → booking returns to REUPLOAD_REQUIRED with the new reason, guest can re-upload again (no cap on the number of retries).

---

## 2. Registered Customer Journeys

### 2.1 Signup & login
- [ ] Sign up with email + password → account created, redirected appropriately.
- [ ] Sign up with an email already in use → clean, non-leaky error.
- [ ] Sign up with a phone number not matching `09XXXXXXXXX` → validation error, blocked client-side.
- [ ] Sign up with a weak/too-short password → validation error before hitting the API.
- [ ] Confirm the "Confirm your Wash & Go account" verification email arrives (`sendVerificationEmail`) and the link actually verifies the account.
- [ ] Log in with correct credentials → lands on Home/Client view with navbar showing "My Bookings" (not "Check Status").
- [ ] Log in with wrong password → clean error, no info leak about whether the email exists.
- [ ] Log in with an email that was never signed up → same generic error as wrong password (no user-enumeration via error message differences).
- [ ] Google OAuth sign-in (new user) → completes and creates a `profiles` row.
- [ ] Google OAuth sign-in (returning user, email matches an existing password-based account) → links/reuses the account sanely, doesn't create a duplicate profile.
- [ ] Password reset request → "Reset your Wash & Go password" email arrives (`sendPasswordResetEmail`).
- [ ] Request password reset 4+ times within a minute from the same IP → 4th+ attempt is rate-limited (3/min, DB-backed, survives a backend restart).
- [ ] Complete password reset via emailed link → `PASSWORD_RECOVERY` event fires, reset form shows, new password takes effect on next login; old password no longer works.
- [ ] Request an email change (`PATCH /api/auth/request-email-change`) → "Confirm your new email" email arrives (`sendEmailChangeVerificationEmail`) at the **new** address; account email doesn't change until the link is confirmed.
- [ ] Session expiry: let a session go stale / manually invalidate the token, then trigger an authenticated API call → `api.ts` catches the 401, calls `supabase.auth.signOut()`, and reloads rather than showing a broken authenticated view.

### 2.2 Logged-in booking creation
- [ ] Repeat the wizard flow from §1.1 while logged in → booking is associated with the account (`user_id` set), not a guest booking.
- [ ] Confirm the booking appears immediately in "My Bookings" without needing to check by Booking ID.
- [ ] Logged-in booking still gets a status token generated/stored internally even though the UI never surfaces it (used for parity with guest bookings and any token-based internal flows).

### 2.3 Profile & booking history
- [ ] Navigate to Profile (`UserProfile.tsx`) → shows account info, editable phone, and the **Membership Status Card**.
- [ ] Edit the phone number to an invalid format → blocked client-side, consistent with signup/booking validation.
- [ ] If not a member: card shows a join-prompt instead of status.
- [ ] "My Bookings" list shows all bookings for the account, polling every ~10s, `isPastBooking`/`isActiveBooking` sorting/labeling correct per Manila time (test with a booking scheduled "today" late at night vs. "yesterday").
- [ ] A brand-new account with zero bookings shows a clean empty state, not a blank/broken list (see §14).

### 2.4 Membership status card (as a member)
- [ ] For an account with an active membership, Profile page auto-loads `getMyMembership()` and shows: membership number, status badge, progress bar toward next free wash (`visit_count % 10`), vehicle list (up to 3), and a "free wash ready" banner once a `free_wash_credits` balance exists.
- [ ] First-wash-offer reminder shows correctly if the member hasn't used their first-wash discount yet, and disappears once `first_wash_used = true`.
- [ ] For a **CANCELLED** or **EXPIRED** membership, confirm the card reflects that status accurately (not shown as ACTIVE).

### 2.5 Multi-tab / multi-device session behavior
- [ ] Log in on two browser tabs (or a tab + incognito window with the same account) → both reflect the same booking data via polling; an action in one (e.g. reupload) eventually shows in the other without a manual refresh.
- [ ] Log out in one tab → the other tab's next authenticated call correctly detects the invalid session (per the 401 handling in §2.1) rather than silently continuing as if still logged in.

---

## 3. Admin Journeys

### 3.1 Admin login & dashboard access
- [ ] Log in with an admin account → navbar/route allows reaching the Admin dashboard; a non-admin account attempting the same URL is blocked (frontend hides the UI, but confirm backend `AdminGuard` also rejects — try hitting an admin API endpoint directly with a non-admin token via browser devtools/network tab and confirm 403).
- [ ] Log out of admin, then try navigating directly to the admin URL while logged out → redirected/blocked, not a flash of admin UI before redirect.

### 3.2 Bookings tab
- [ ] Table lists all bookings, filterable by date range and searchable.
- [ ] Search with a query that matches nothing → clean empty state, not an error.
- [ ] Search with special characters (`%`, `_`, `'`, `"`, `;--`) → treated as literal text, no SQL error surfaces, no unintended wildcard matching.
- [ ] Capacity overview reflects real-time slot usage per category (LUBE: 1/slot, GROOMING: 2/slot, COATING: 2/slot).
- [ ] Open a booking's detail modal → payment proof image renders (signed URL), status history is visible, admin field edits (plate number, notes, etc.) save correctly.
- [ ] Edit every editable field one at a time (`date`, `time_slot`, `plate_number`, `customer_name`, `customer_phone`, `customer_email`, `notes`) → each persists individually; fields **not** in the admin `adminUpdate()` whitelist are confirmed to be rejected or silently ignored, not partially applied.
- [ ] **Regression — plate normalization:** edit a booking's plate number to lowercase/mixed-case with stray spaces or dashes (e.g. `abc 1234`) via the admin edit field → save → confirm it's stored normalized (uppercase, alphanumeric only, e.g. `ABC1234`) and any membership match against that plate still works.
- [ ] Guest bookings show a visible "Guest" badge distinguishing them from account-linked bookings.
- [ ] Edit a booking's date/time to a slot that's already at capacity → rejected (re-checked server-side, not just trusted from the client).

### 3.3 Payment confirm/decline
- [ ] Confirm a PENDING_VERIFICATION booking's payment → status becomes **CONFIRMED**, `sendBookingStatusEmail` fires, audit log gets a `CONFIRM_PAYMENT` entry.
- [ ] Decline a PENDING_VERIFICATION booking's payment with a reason → status becomes **REUPLOAD_REQUIRED**, `sendPaymentDeclinedEmail` fires with the specific reupload-instructions template (not a generic fallback) — confirm the reason text appears verbatim (HTML-escaped) in the email.
- [ ] Decline a payment **without** a reason (if the UI allows leaving it blank) → email still sends with a sensible default, no broken template.
- [ ] Confirm the "Decline" button is present and wired in the dashboard UI (previously missing — verify it now exists and works end-to-end, not just via direct API call).
- [ ] Confirm a booking that is **already CONFIRMED** → blocked/no-op, doesn't double-fire the confirmation email or create a duplicate audit entry.
- [ ] Decline a **REUPLOAD_SUBMITTED** booking (second decline after a reupload) → returns to REUPLOAD_REQUIRED again with the new reason, admin notification email (`sendBookingCreatedAdminEmail`, reused for "re-review needed") fires on the original reupload submission.

### 3.4 Status progression
- [ ] Move a CONFIRMED booking to **IN_PROGRESS** → status updates, `sendBookingStatusEmail` fires, audit log `UPDATE_STATUS` entry created.
- [ ] Add a progress update with an attached image (`ADD_PROGRESS_UPDATE`) → appears in the booking's update history, `sendProgressUpdateEmail` fires to the customer.
- [ ] Add a progress update **without** an image → still saves and emails correctly.
- [ ] Move to **COMPLETED** → for a GROOMING booking, confirm this is the trigger point for membership visit-counting (see §4.5) if the plate is a member's vehicle.
- [ ] Move a booking directly from PENDING to COMPLETED (skipping intermediate states) → no state-machine enforcement exists, confirm this doesn't crash and behaves sanely (e.g. still triggers visit-counting logic once, if applicable).
- [ ] Set a booking to **CANCELLED** from every possible prior state (PENDING, PENDING_VERIFICATION, CONFIRMED, IN_PROGRESS, REUPLOAD_REQUIRED, REUPLOAD_SUBMITTED) → confirm no crash in any case, no refund logic is expected (known limitation), slot frees up in the capacity overview for statuses that were holding it.
- [ ] Re-open (change away from) a CANCELLED booking back to an active status → confirm the system allows or cleanly blocks this (no state machine means it's technically allowed — verify the slot capacity check re-applies correctly if re-activated into a now-full slot).

### 3.5 Walk-in booking (admin-created)
- [ ] From the admin dashboard, create a booking directly (walk-in mode) for a customer physically present.
- [ ] Confirm it **skips payment proof entirely** and is auto-set to **CONFIRMED** immediately — no PENDING/PENDING_VERIFICATION intermediate state.
- [ ] Confirm this booking still consumes slot capacity like any other CONFIRMED booking.
- [ ] Create a walk-in booking for each service category (LUBE, GROOMING, COATING) → all skip payment correctly regardless of category.
- [ ] Create a walk-in booking with a plate number matching an active membership → discount still applies correctly even in walk-in mode.

### 3.6 Services & Rates tab
- [ ] Edit a service's price (e.g. GROOMING price_medium) → save → audit log `UPDATE_PRICE` entry created → new bookings for that service/size reflect the updated price; verify the booking wizard's Step 1 pricing display also updates.
- [ ] Edit every price field for a LUBE service (GAS price, DIESEL price) → both save independently and correctly.
- [ ] Edit every size price for a GROOMING/COATING service (small/medium/large/extra_large) → each saves independently.
- [ ] Set a price to `0` or a negative number → confirm validation blocks nonsensical values if such validation exists, or document that it doesn't (flag as a gap if not).
- [ ] Deactivate a service (if the UI supports it) → it disappears from the customer-facing Step 1 list but existing bookings referencing it are unaffected.
- [ ] Toggle a service's `membership_discount_pct` → confirm the change is reflected immediately in the next booking's discount preview (§6).

### 3.7 Settings tab — Schedule management
See §10 for detailed schedule scenarios. Quick smoke check:
- [ ] Change default open/close hours → saves, reflected in the customer-facing calendar.
- [ ] Add a closed-day override for a specific date with a label → that date greys out on the customer calendar with the label as the reason.
- [ ] Try to close all 7 weekdays at once → server-side validation blocks it ("can't close all 7 weekdays").
- [ ] Try to set close time before open time → validation blocks it.

### 3.8 Settings tab — Payment methods
- [ ] Update the GCash QR image → new image reflects in the customer Payment step (Step 5) checkout via a signed URL.
- [ ] Update bank/other payment method details → reflected correctly.
- [ ] Upload a non-image file as the QR code → rejected by the same file validation rules as booking proof uploads (§11).

---

## 4. Membership (Club Wash & Go) Journeys — Admin side

### 4.1 Issue a membership
- [ ] Memberships tab → "Make a Member" → Search step: search by name, then by phone, then by email → each finds the correct existing account.
- [ ] Search for an account that doesn't exist → no results, clean empty state (not an error).
- [ ] Search for an **admin** account's name/email → confirm it is **excluded** from results (membership issuance is customer-only).
- [ ] Select a found customer → Profile step shows their contact info + GROOMING-only carwash history (confirm a LUBE or COATING booking in their history does **not** appear in this list).
- [ ] Select a customer with **zero** prior bookings → history shows a clean empty state, issuance still proceeds normally.
- [ ] Proceed to Vehicles step → register 1 vehicle → issue → membership created with format `CWG-NNNNNN`, `ISSUE_MEMBERSHIP` audit log entry created, "Welcome to Club Wash & Go" email sent (`sendMembershipIssuedEmail`).
- [ ] Register 2 vehicles at issuance → succeeds, both saved.
- [ ] Register 3 vehicles at issuance (the max) → succeeds. Try a 4th → blocked client-side and/or server-side.
- [ ] **Regression — random membership numbers:** issue 2-3 memberships back to back and confirm the numbers are **not** sequential (e.g. not `CWG-000045`, `CWG-000046`, `CWG-000047`) — they should look unrelated/random.
- [ ] Try issuing a membership to an account that already has one (active) → blocked with a clear error, no duplicate created.
- [ ] Try issuing a membership without selecting an account first (`userId` omitted) → blocked — DTO requires `userId`.
- [ ] Try registering a plate that is **already active on someone else's membership** → blocked (plate is globally unique across active memberships), clear error, no duplicate row.

### 4.2 Plate number entry & normalization
- [ ] Register a vehicle with a lowercase plate (`abc1234`) → confirm it's stored/displayed normalized to uppercase.
- [ ] Register a vehicle with spaces or dashes (`ABC 1234`, `ABC-1234`) → confirm it's normalized to the same canonical form as a clean entry (`ABC1234`), so later plate-based lookups (discount matching, booking-time lookup) succeed regardless of how staff typed it.
- [ ] Register a vehicle with a mix of upper/lower and symbols (`aBc-12 34`) → normalizes the same way.
- [ ] Try entering a plate number longer than 10 characters → blocked by validation (`@MaxLength(10)`).
- [ ] Try entering an empty plate number → blocked (`@IsNotEmpty`).
- [ ] Try entering a plate with only symbols (`---`, `   `) → after normalization this becomes an empty string; confirm it's rejected rather than silently stored as blank.

### 4.3 Manage vehicles
- [ ] Add a vehicle to an existing membership (up to the 3-vehicle cap) → `ADD_MEMBERSHIP_VEHICLE` audit entry created.
- [ ] Try adding a 4th vehicle → blocked.
- [ ] Try adding a vehicle whose plate is already registered elsewhere (another active membership) → blocked, same as at issuance.
- [ ] Remove a vehicle → `REMOVE_MEMBERSHIP_VEHICLE` audit entry created, vehicle no longer eligible for discounts.
- [ ] Remove a vehicle, then re-add the **same** plate to the **same** membership later → succeeds (plate is free again once removed).
- [ ] Remove the **last remaining** vehicle from a membership → confirm the membership itself stays intact (still ACTIVE, just zero vehicles) rather than crashing or auto-cancelling.

### 4.4 Renew / cancel
- [ ] Renew a membership nearing/past expiry → status returns to ACTIVE, `expires_at` extends by 1 year from current expiry (if still active) or from today (if lapsed), `expiring_reminder_sent_at` resets to null (so the reminder can fire again next cycle), `RENEW_MEMBERSHIP` audit entry, "Membership Renewed" email sent (`sendMembershipRenewedEmail`).
- [ ] Cancel an active membership → status changes to CANCELLED, `CANCEL_MEMBERSHIP` audit entry created, member's discounts no longer apply on new bookings.
- [ ] Try to renew a CANCELLED membership → confirm expected behavior (blocked, or requires re-issuance instead) — document whichever the system actually does.
- [ ] Cancel, then issue a **brand-new** membership to the same account → succeeds (no lingering "already has one" block from the cancelled record), new membership gets its own random `membership_no`.

### 4.5 Visit counting & discount priority (core business logic — test carefully)
Set up a membership with a registered vehicle, then create bookings for that plate and walk them to COMPLETED:
- [ ] **First GROOMING booking after joining** (before any visits recorded): booking should apply **FIRST_WASH** discount if the member hasn't used it yet — confirm it takes priority over any CATEGORY_PERCENT discount also tagged on that service.
- [ ] Complete that booking → confirm `visit_count` increments by 1, `first_wash_used` flips to `true`, and `membership_visit_counted` prevents a second increment if the status is written to COMPLETED again (idempotency — try re-saving the same status, or flapping COMPLETED → IN_PROGRESS → COMPLETED).
- [ ] Second GROOMING booking (first_wash already used, no credits yet) → no discount applies, full price (minus any CATEGORY_PERCENT tag if the service has one independent of membership).
- [ ] Book and complete GROOMING visits up to the 10th → the 10th completion should grant a **free_wash_credits** credit and fire the "free wash earned" email (`sendFreeWashEarnedEmail`), but only on **that exact** visit — not the 9th, not the 11th.
- [ ] On the member's next GROOMING booking (11th), confirm **FREE_WASH** discount applies automatically (highest priority — over FIRST_WASH remnants or CATEGORY_PERCENT) and consumes one credit (`totalPrice = 0`).
- [ ] Complete the FREE_WASH booking → confirm `free_wash_credits` decrements by 1 (redeemed).
- [ ] Reach the 20th visit → a second free-wash credit is granted independently of the first.
- [ ] Book a **LUBE or COATING** service on a member's plate → confirm FREE_WASH/FIRST_WASH never apply (both are GROOMING-only); at most a CATEGORY_PERCENT tag applies if that service has one.
- [ ] Complete a LUBE/COATING booking on a member's plate → confirm the shared visit counter does **NOT** increment (only GROOMING visits count), but `membership_visit_counted` is still set true so it isn't miscounted or re-processed later.
- [ ] Two vehicles on the same membership: complete a GROOMING visit on vehicle A, then check vehicle B's status via the wizard's live discount preview → visit count should be the shared/combined count across both vehicles, not per-vehicle.
- [ ] A booking on a plate that belongs to an **EXPIRED** or **CANCELLED** membership → no discount applies at all, treated the same as a non-member plate.
- [ ] A booking on a plate created **before** it was registered to a membership (i.e., the plate existed in booking history first, then later got added to a membership) → confirm past bookings aren't retroactively affected; only new bookings after registration get discount eligibility.

### 4.6 Membership expiry (cron-driven — hard to test live; verify conceptually or via manual trigger if accessible)
- [ ] If there's a way to manually invoke `processMembershipExpiries()` (e.g. via a test script or admin action), confirm a membership past its expiry date flips ACTIVE → EXPIRED and the "expired" email fires (`sendMembershipExpiredEmail`).
- [ ] Confirm a membership within 30 days of expiry gets the "expiring soon" reminder email **once** per cycle (not on every daily cron run) via the `expiring_reminder_sent_at` guard.
- [ ] Confirm a membership **more than** 30 days from expiry gets no reminder yet.
- [ ] Confirm a freshly-renewed membership (reminder flag reset to null) becomes eligible for a reminder again once it re-enters the 30-day window on its new cycle.

### 4.7 Booking-time discount preview (customer side)
- [ ] In the booking wizard, Step 5 (Payment Form), enter a plate number belonging to an active member → the pricing summary shows the applicable discount (FREE_WASH/FIRST_WASH/CATEGORY_PERCENT) and reason, matching what the backend will actually apply.
- [ ] Enter a plate that isn't registered to any membership → no discount shown, full price applies.
- [ ] Enter a plate belonging to an EXPIRED or CANCELLED membership → no discount shown.
- [ ] **Regression — case/format matching:** register a membership vehicle as `XYZ5678`, then in the booking wizard type the plate as `xyz 5678` (lowercase, with a space) → confirm the discount preview still recognizes it as the same member vehicle (this was a real bug — case/format mismatches used to silently fail to match).
- [ ] Change the plate number mid-Step-5 after the preview already loaded (e.g. from a member's plate to a non-member plate) → preview updates correctly, doesn't show stale discount info.
- [ ] Rate-limit check: trigger the vehicle-status lookup 21+ times in a minute (e.g. by rapidly editing the plate field) → throttled (20/min).

---

## 5. Admin Customer Search (Memberships → "Make a Member" search)

- [ ] Search by a partial name → matches (case-insensitive) return.
- [ ] Search by full name → matches return.
- [ ] Search by phone → matches return.
- [ ] Search by partial phone → confirm whether partial phone matching is supported (document actual behavior).
- [ ] Search by email → matches return (email comes from Supabase Auth, not `profiles`).
- [ ] Search by partial email (e.g. just the domain) → confirm actual matching behavior.
- [ ] Search with a query too short to be meaningful (1 character) → either returns broad results or is blocked with a "type more" hint — confirm it doesn't time out or error.
- [ ] Search for an admin's name/phone/email → excluded from results (customer-only).
- [ ] **Regression — pagination cap fix:** this is hard to reproduce manually without 1000+ real accounts, but if a test/staging project has a way to seed many accounts, confirm a customer created *after* the 1000th account is still findable by email search. Conceptually: the search now loops through every page of Supabase Auth users instead of only reading the first 1,000 — spot-check by reading `MembershipsService.listAllUsers()` if seeding isn't feasible, and confirm `searchCustomers()` test suite (`memberships.service.spec.ts`) passes.

---

## 6. Service × Vehicle × Pricing Combination Matrix

Every pricing code path, exhaustively. Substitute your shop's actual current service names from the Services & Rates tab — the categories/sizes/fuel types below are fixed by the enums (`ServiceCategory`, `VehicleSize`, `FuelType`).

### 6.1 LUBE (flat by fuel type — vehicle size ignored)
| Fuel Type | Vehicle Type | Expected Behavior |
|---|---|---|
| GAS | Car | Flat GAS price applies regardless of size |
| GAS | Motorcycle | Flat GAS price applies regardless of size |
| DIESEL | Car | Flat DIESEL price applies regardless of size |
| DIESEL | Motorcycle | Flat DIESEL price applies regardless of size |

- [ ] For each of the 4 rows above: confirm the price shown in Step 1/Step 5 matches the service's `lubePrices[fuelType]` value exactly, and that changing `vehicleSize` in Step 2 has **zero** effect on the final price for a LUBE booking.
- [ ] Confirm Step 3 (fuel type selector) is mandatory for LUBE — can't proceed without picking GAS or DIESEL.

### 6.2 GROOMING (price by vehicle size)
| Vehicle Size | Vehicle Type = Car | Vehicle Type = Motorcycle |
|---|---|---|
| SMALL | `price_small` applies | `price_small` applies |
| MEDIUM | `price_medium` applies | `price_medium` applies |
| LARGE | `price_large` applies | `price_large` applies |
| EXTRA_LARGE | `price_extra_large` applies | `price_extra_large` applies |

- [ ] All 8 cells: confirm the displayed price matches the corresponding `price_*` field on the service, and Step 3 (fuel type) is correctly **skipped** for every one of them.
- [ ] Down payment shown = exactly 30% of the (possibly membership-discounted) total for each cell.

### 6.3 COATING (price by vehicle size)
| Vehicle Size | Vehicle Type = Car | Vehicle Type = Motorcycle |
|---|---|---|
| SMALL | `price_small` applies | `price_small` applies |
| MEDIUM | `price_medium` applies | `price_medium` applies |
| LARGE | `price_large` applies | `price_large` applies |
| EXTRA_LARGE | `price_extra_large` applies | `price_extra_large` applies |

- [ ] All 8 cells: same checks as §6.2, plus confirm any multi-day (≥24h) COATING service correctly shows only a start-time slot requirement (see §9).

### 6.4 Membership discount overlay (cross-reference with §4.5/§4.7)
For a plate registered to an active member, repeat the relevant rows above with:
- [ ] FREE_WASH active (GROOMING only) → total becomes ₱0, down payment becomes ₱0.
- [ ] FIRST_WASH active (GROOMING only) → total is 50% of the normal price for that cell, down payment is 30% of the discounted total.
- [ ] CATEGORY_PERCENT active (any category with `membership_discount_pct` set) → total is `(100 - pct)%` of the normal price for that cell.
- [ ] No discount (non-member plate, or member plate on a category/state where nothing applies) → full price, unchanged from §6.1–6.3.

### 6.5 Down payment arithmetic
- [ ] For at least one booking in each category, manually verify `downPaymentAmount === round(totalPrice * 0.30)` (or whatever rounding the UI uses) rather than assuming the displayed number is correct.

---

## 7. Booking Status — Per-Role Visibility Matrix

For each status below, confirm the label/color shown matches, and that the **right people** can see it (guest via Booking ID, customer via My Bookings, admin via dashboard) with no data leaking to the wrong role.

| Status | Label shown | Color | Guest status page | Customer "My Bookings" | Admin dashboard |
|---|---|---|---|---|---|
| PENDING | Pending | — | ✅ visible | ✅ visible | ✅ visible, doesn't hold slot capacity |
| PENDING_VERIFICATION | Payment Review | blue | ✅ visible | ✅ visible | ✅ visible, holds slot capacity, Confirm/Decline actions available |
| REUPLOAD_REQUIRED | Re-upload Required | red | ✅ visible + decline reason + reupload control | ✅ visible + can reupload if they navigate to status check | ✅ visible, doesn't hold slot capacity |
| REUPLOAD_SUBMITTED | Proof Resubmitted | purple | ✅ visible | ✅ visible | ✅ visible, holds slot capacity, Confirm/Decline actions available |
| CONFIRMED | Confirmed | blue | ✅ visible | ✅ visible | ✅ visible, holds slot capacity |
| IN_PROGRESS | In Progress | orange | ✅ visible, progress updates shown | ✅ visible, progress updates shown | ✅ visible, can add progress updates |
| COMPLETED | Completed | green | ✅ visible | ✅ visible | ✅ visible, triggers membership visit-count if applicable |
| CANCELLED | Cancelled | red | ✅ visible | ✅ visible | ✅ visible, frees slot capacity |

- [ ] Walk through every row for at least one guest booking and one logged-in booking each.
- [ ] Confirm a guest **cannot** see another guest's booking by guessing a Booking ID pattern (IDs are `BK-` + 6 random digits, not sequential — spot-check a couple of adjacent-looking IDs return "not found").
- [ ] Confirm a logged-in customer's "My Bookings" never shows another customer's booking.

---

## 8. Email Notification Matrix (every template)

All sends are fire-and-forget (`void`) — a failure here must never block the API response that triggered it. For each row, trigger the action and confirm the email arrives with correct content (recipient, subject, key data fields, HTML escaping of user input).

| # | Template | Function | Recipient | Trigger |
|---|---|---|---|---|
| 1 | Email verification | `sendVerificationEmail` | new signup | `POST /api/auth/signup` |
| 2 | Password reset | `sendPasswordResetEmail` | requesting account | `POST /api/auth/request-password-reset` |
| 3 | Email change verification | `sendEmailChangeVerificationEmail` | new email address | `PATCH /api/auth/request-email-change` |
| 4 | Booking received (customer) | `sendBookingCreatedCustomerEmail` | `booking.customer_email` | `POST /api/bookings`, only if an email was provided |
| 5 | New booking (admin) | `sendBookingCreatedAdminEmail` | `ADMIN_NOTIFICATION_EMAILS` | `POST /api/bookings`, always if env var set |
| 6 | Status update | `sendBookingStatusEmail` | `booking.customer_email` | `PATCH /api/bookings/:id/status`, and on payment confirm |
| 7 | Payment declined | `sendPaymentDeclinedEmail` | `booking.customer_email` | `POST /api/bookings/:id/payment/decline` |
| 8 | Re-review needed (admin) | `sendBookingCreatedAdminEmail` (reused) | `ADMIN_NOTIFICATION_EMAILS` | `POST /api/bookings/:id/payment-proof` (guest reupload) |
| 9 | Progress update | `sendProgressUpdateEmail` | `booking.customer_email` | `POST /api/bookings/:id/updates` |
| 10 | Membership issued | `sendMembershipIssuedEmail` | member's account email | `POST /api/memberships`, after successful issuance |
| 11 | Membership renewed | `sendMembershipRenewedEmail` | member's account email | `POST /api/memberships/:id/renew` |
| 12 | Free wash earned | `sendFreeWashEarnedEmail` | member's account email | Booking → COMPLETED, only the visit that crosses a multiple of 10 |
| 13 | Membership expiring soon | `sendMembershipExpiringSoonEmail` | member's account email | Daily cron, once per expiry cycle |
| 14 | Membership expired | `sendMembershipExpiredEmail` | member's account email | Daily cron, when `expires_at` has passed |

- [ ] Trigger all 14 and confirm each arrives exactly once (not zero, not duplicated) per trigger event.
- [ ] Confirm every template correctly HTML-escapes user-controlled values (customer name, notes, decline reason, membership member name) — try triggering one with a name containing `<b>Test</b>` and confirm it renders as literal text in the email, not bold.
- [ ] Confirm the shared `wrapper()` branded header/footer renders consistently across all 14.
- [ ] Locally (no `BREVO_API_KEY` set): confirm signup still auto-confirms the email rather than hanging on a missing send (per `docs/HANDOFF.md` environment notes) — email-dependent flows should only be fully tested against the deployed Railway backend.

---

## 9. Slot Availability & Capacity (incl. boundary conditions)

- [ ] Book enough GROOMING appointments in the same 1-hour slot to hit the cap of **2 concurrent bookings** → a 3rd booking attempt for that same slot/date is rejected or the slot disappears from availability.
- [ ] Book exactly up to the cap (2 for GROOMING/COATING, 1 for LUBE) → the slot is still bookable up to and including the cap boundary, not blocked one early.
- [ ] Same boundary test for LUBE at cap **1** and COATING at cap **2**.
- [ ] Cancel one of the bookings holding a full slot → the slot immediately becomes available again for a new booking.
- [ ] Confirm only bookings in `SLOT_CHECK_STATUSES` (PENDING_VERIFICATION, REUPLOAD_SUBMITTED, CONFIRMED, IN_PROGRESS) hold the slot — a booking sitting in PENDING or REUPLOAD_REQUIRED should **not** block others from booking that slot.
- [ ] Try to book a slot where `slot_start + service_duration > close_time` → slot doesn't appear as an option (e.g. a 2-hour COATING service late in the day).
- [ ] Try a service whose duration fits **exactly** to close time (`slot_start + duration === close_time`) → confirm it's allowed (boundary is inclusive, not off-by-one excluded).
- [ ] Multi-day service (≥24h duration, e.g. long ceramic coating): confirm it only needs to **start** within operating hours — it isn't excluded by the same-day close-time check.
- [ ] Try booking a date in the past → blocked.
- [ ] Try booking "today" for a time slot that has already passed (e.g. it's 3pm and you try to book the 10am slot) → confirm whether this is blocked (should be, in spirit, even if not explicitly called out — flag as a gap if it isn't).
- [ ] Try booking the very first slot of the day (open_time) and the very last valid slot (close_time − duration) → both work correctly at the edges.

---

## 10. Schedule Management (Admin Settings tab)

- [ ] Mark a specific weekday (e.g. every Sunday) as closed in the recurring weekly schedule → confirm the customer calendar greys out all matching future Sundays.
- [ ] Add a one-off closure (holiday) via `schedule_overrides` for a specific date → only that date greys out, not the whole week/pattern.
- [ ] Add a custom/half-day override (e.g. custom open/close hours for a specific date) → the customer calendar's time slots for that date reflect the custom hours, not the default.
- [ ] Try an override where custom close ≤ custom open → validation blocks it.
- [ ] Try to close all 7 weekdays in the recurring schedule → blocked ("can't close all 7 weekdays").
- [ ] Close 6 of 7 weekdays (the maximum allowed) → succeeds.
- [ ] Add/remove a closure label with HTML/script content (e.g. `<script>alert(1)</script>` as the label) → confirm it's sanitized (`stripHtml()`) and doesn't execute or break rendering anywhere it's displayed.
- [ ] Add an override for a date that already has an override → confirm the system updates/replaces it rather than creating a duplicate conflicting row.
- [ ] Delete a schedule override → date reverts to the default weekly schedule.
- [ ] Guest status-token expiry extension: create a guest booking, then have an admin add several holiday/closed-day overrides landing within the token's 48-hour window → confirm the token's effective expiry extends (+24h per closed/holiday day in the window, capped at 14 extensions) rather than lapsing while the shop is closed. (Best verified by inspecting the token expiry value in the DB rather than waiting out 48 hours.)

---

## 11. File Upload Edge Cases

- [ ] Upload a payment proof with each supported extension (`.jpg`, `.jpeg`, `.png`, `.webp`) → all succeed.
- [ ] Upload a payment proof with an unsupported extension (e.g. `.pdf`, `.gif`, `.bmp`, `.svg`) → rejected with a 400, clear error shown.
- [ ] Upload a file over 5 MB → rejected.
- [ ] Upload a file at just under 5 MB → succeeds.
- [ ] Rename a `.exe` to `.jpg` and upload → MIME-type cross-check should still catch the mismatch and reject it.
- [ ] Upload a real `.jpg` but with the `mimeType` query param spoofed to something else → rejected on mismatch.
- [ ] Omit the optional `mimeType` param entirely → still validated by extension alone, no crash.
- [ ] Attempt a path-traversal filename (e.g. `../../evil.jpg`) via devtools/network tab manipulation → rejected/sanitized, does not write outside the intended storage path.
- [ ] Upload a filename with unusual characters (spaces, unicode, very long name) → handled gracefully, no crash.
- [ ] Hit the upload endpoint 6+ times within 5 minutes for the same booking → rate limited (5 attempts/5 min).
- [ ] Upload a progress-update image (admin side) with the same edge cases above → same validation applies.

---

## 12. Security & Abuse — Field-by-Field Injection Matrix

For **every** free-text field below, try each payload and confirm it's stored/displayed safely (stripped via `stripHtml()` and/or escaped via `escapeHtml()` before any HTML output), never executed, and never causes a raw DB/stack-trace error to leak to the client:

**Fields to test:** booking `customer_name`, `notes`, admin `decline_reason`, membership `member_name` / vehicle `vehicleLabel`, schedule override `label`, admin search query, plate number field (should be rejected/normalized rather than "escaped", per §4.2).

**Payloads to try in each field:**
- [ ] `<script>alert(1)</script>`
- [ ] `<img src=x onerror=alert(1)>`
- [ ] `"><svg onload=alert(1)>`
- [ ] `'; DROP TABLE bookings; --`
- [ ] A string at exactly the field's max length, and one character over → the over-length one is rejected, not silently truncated (unless truncation is the documented behavior — verify which).
- [ ] Emoji / non-Latin unicode (e.g. `日本語`, `🚗`) → stored and displayed correctly, no mangling.
- [ ] Leading/trailing whitespace only → confirm it's trimmed or rejected as effectively-empty where the field is required.

**Beyond field content:**
- [ ] Submit the booking form with the hidden honeypot `website` field populated (only reachable via devtools/direct API call, not through normal UI use) → immediate 400 rejection, no booking created.
- [ ] Send a JSON body over 10 KB to any endpoint → rejected with 413.
- [ ] Send 21+ requests to any endpoint within a minute from the same IP → global throttle (20/min) kicks in with a 429.
- [ ] Send 4+ `POST /api/bookings` within a minute → per-endpoint throttle (3/min) kicks in even though the global limit isn't hit yet.
- [ ] Send 11+ `POST /api/bookings/status` lookups within a minute → throttled (10/min).
- [ ] Send 11+ `POST /api/auth/check-email` within a minute → throttled (10/min).
- [ ] Send 11+ `POST /api/memberships/lookup` within a minute → throttled (10/min).
- [ ] Send 21+ `GET /api/memberships/vehicle-status` within a minute → throttled (20/min).
- [ ] Try accessing another guest's booking status using a booking ID you don't own but a wrong/expired status token where relevant → rejected.
- [ ] Open browser devtools Network tab during any admin action → confirm no raw Supabase error text, stack traces, or internal details leak in API error responses (only clean, user-facing messages) — do this for at least one deliberately-broken request (e.g. malformed payload) per module (bookings, memberships, auth, admin).
- [ ] Try calling an admin-only endpoint with no `Authorization` header at all → 401, not 403 or 500.
- [ ] Try calling an admin-only endpoint with a valid but non-admin JWT → 403.
- [ ] Try calling an admin-only endpoint with an expired/tampered JWT → 401.

---

## 13. Concurrency & Race Conditions

- [ ] Two browser sessions attempt to book the **last available slot** in a category at nearly the same time → only one succeeds; the other gets a clean "slot no longer available" rejection (server re-checks availability at creation time, not just what the client last saw).
- [ ] Admin and customer both have a booking's detail/status page open; admin changes status while customer is mid-reupload on the same booking → no data corruption; the reupload either succeeds against the new state or is cleanly rejected, not silently lost.
- [ ] Two admins both open the same booking and edit different fields at nearly the same time → both edits land (no full-record overwrite clobbering the other's change), or a clear conflict is surfaced — confirm actual behavior.
- [ ] Rapidly click "Confirm Payment" twice on the same booking (double-submit) → only one `CONFIRM_PAYMENT` audit entry, only one confirmation email, no duplicate processing.
- [ ] Two vehicles under the same membership both used in bookings completed at nearly the same instant → `visit_count` increments correctly for both (no lost update from a race on the shared counter).
- [ ] A membership's 10th visit and an admin's manual "add vehicle" action happen concurrently → no crash, final state is consistent (visit count incremented, vehicle added, free wash email fired).

---

## 14. Empty States

- [ ] Brand-new customer account, zero bookings → "My Bookings" shows a clean empty state, not a blank screen or error.
- [ ] Brand-new customer account, not a member → Profile's Membership Status Card shows the join-prompt, not a crash from missing membership data.
- [ ] Admin Bookings tab with a date-range filter that matches zero bookings → clean empty state.
- [ ] Admin Memberships search with zero matches → clean empty state, not an error toast.
- [ ] A date with zero available slots (fully booked or fully closed) → calendar clearly indicates unavailability rather than showing an empty/broken time-slot list.
- [ ] Services & Rates tab if a category temporarily has zero active services → doesn't crash the booking wizard's Step 1 for that category.
- [ ] A membership with zero vehicles (all removed) → status card / admin detail view renders without crashing, shows "no vehicles" rather than a blank list.
- [ ] A member with `visit_count = 0` (brand new membership, no visits yet) → progress bar renders at 0%, not broken math (e.g. no division-by-zero display glitch).

---

## 15. Admin Audit Log — Every Action Type

Every admin mutation should produce exactly one audit row. Trigger each action below at least once and confirm a matching row appears in `admin_audit_logs` with the correct `action`, `adminUserId`, `targetId`, and `targetType`:

- [ ] `CONFIRM_PAYMENT` — confirming a payment
- [ ] `DECLINE_PAYMENT` — declining a payment
- [ ] `UPDATE_STATUS` — changing a booking's status
- [ ] `EDIT_BOOKING` — editing booking fields
- [ ] `ADD_PROGRESS_UPDATE` — adding a progress note/image
- [ ] `UPDATE_PRICE` — editing a service's price
- [ ] `ISSUE_MEMBERSHIP` — issuing a new membership
- [ ] `RENEW_MEMBERSHIP` — renewing a membership
- [ ] `CANCEL_MEMBERSHIP` — cancelling a membership
- [ ] `ADD_MEMBERSHIP_VEHICLE` — adding a vehicle to a membership
- [ ] `REMOVE_MEMBERSHIP_VEHICLE` — removing a vehicle
- [ ] `MEMBERSHIP_VISIT_RECORDED` — a GROOMING booking completing on a member's plate
- [ ] `UPDATE_SCHEDULE` — changing default hours or closed weekdays
- [ ] `ADD_SCHEDULE_OVERRIDE` — adding a date-specific override
- [ ] `DELETE_SCHEDULE_OVERRIDE` — removing a date-specific override

- [ ] Confirm audit log entries are actually being written at all — this was a real historical bug (`void insert()` never awaited, so nothing was logged for a period) — spot check that recent actions truly persisted in the table, not just that the UI showed success.
- [ ] Confirm cron-driven membership expiry mutations (§4.6) do **not** create audit log rows (no admin actor exists for those — they're logged via the regular NestJS `Logger` instead, by design).
- [ ] Confirm a failed action (e.g. a rejected edit due to validation) does **not** create a misleading "success" audit row.

---

## 16. Cross-Cutting / Environment Checks

- [ ] Mobile viewport (e.g. 375px width): all 5 wizard steps, admin dashboard tabs, and modals remain usable — no horizontal scroll, popups respect `max-h-[85vh]`.
- [ ] Tablet viewport (e.g. 768px) → layout doesn't break between mobile and desktop breakpoints.
- [ ] Manila timezone correctness: create a booking scheduled for "today" late at night (close to midnight Manila time) and confirm `isPastBooking`/`isActiveBooking` classify it correctly regardless of the machine's local timezone running the browser. Repeat with the browser's OS timezone deliberately set to something far from Manila (e.g. US Pacific) to prove the Manila-timezone logic isn't accidentally using local time.
- [ ] CORS: confirm the deployed frontend origin can call the deployed backend without CORS errors in the console; confirm a random unlisted origin (e.g. via a quick curl/Postman `Origin` header test) is rejected.
- [ ] Reload mid-wizard (every step, 1 through 5) → confirm no unhandled crash; either state persists or the user is gracefully returned to Step 1.
- [ ] Log out mid-session while on the Profile or Admin view → redirected appropriately, no stale protected data flashes on screen.
- [ ] Slow/throttled network (browser devtools network throttling) → the 20-second API timeout in `lib/api.ts` surfaces a clean timeout error rather than an infinite spinner.
- [ ] Browser back/forward buttons during the booking wizard → since there's no React Router, confirm this doesn't produce a broken in-between state.
- [ ] Directly hitting a backend endpoint that doesn't exist (typo'd URL) → clean 404, not a stack trace.

---

## Coverage Notes

This checklist works through every persona journey, every combinatorial matrix (pricing, status visibility, emails, injection payloads), and the specific regressions this project has already hit once (plate-number normalization, membership-number enumeration, customer-search pagination cap, dead audit logging). When a new feature, status, service category, or role is added to the system, extend the relevant matrix/section here rather than starting a separate testing doc — the goal is one living document that stays exhaustive as the system grows.
