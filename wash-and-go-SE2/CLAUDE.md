# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Frontend Overview

React 18 + TypeScript + Vite SPA. Tailwind CSS v4. Runs on port 3000. Uses a custom state-based router (no React Router). All business API calls go through `lib/api.ts` to the NestJS backend; Supabase JS is used only for auth session management.

---

## Commands

```bash
npm run dev       # dev server on http://localhost:3000
npm run build     # production build → dist/
npm run preview   # serve the production build locally
npm run lint      # ESLint (flat config — eslint.config.js)
npm run test      # Vitest unit tests (watch mode: npx vitest)
```

TypeScript errors remain the primary quality gate; ESLint and Vitest supplement it.

---

## View & Navigation System

There is **no React Router**. Navigation is state-driven via a `view` state in `App.tsx`:

```typescript
type ViewType = 'HOME' | 'CLIENT' | 'ADMIN' | 'SERVICES' | 'STATUS' | 'AUTH' | 'PROFILE'
const [view, setView] = useState<ViewType>('HOME')
```

| ViewType | Component | Route Guard |
|---|---|---|
| `HOME` | `HomePage` | Public |
| `CLIENT` | `BookingWizard` | Public (auth optional) |
| `ADMIN` | `AdminDashboard` | Admin only |
| `SERVICES` | `ServicesAndRates` | Public |
| `STATUS` | `CheckStatus` | Public (Booking ID lookup — no token required) |
| `AUTH` | `AuthPage` | Redirects away if already logged in |
| `PROFILE` | `UserProfile` | Auth required |

Navigation happens via `handleViewChange(view)` in `App.tsx`, which applies guards. To navigate programmatically anywhere in the app, call the `onViewChange` prop passed down from `App.tsx`.

---

## Auth State (`context/AuthContext.tsx` + `App.tsx`)

Auth state is initialized once on mount in `App.tsx` and exposed to the component tree via `AuthContext`:

```typescript
// context/AuthContext.tsx
export interface AppUser { id: string; email: string; role: 'admin' | 'user' }
const AuthContext = createContext<AuthContextValue>(...)
export function AuthProvider({ children, user, token, forceRecoveryMode }: AuthProviderProps)
export function useAuth(): AuthContextValue
```

**Context provides:** `user: AppUser | null`, `token: string | null`, `forceRecoveryMode: boolean`

Components import `useAuth()` to access these values — they are NOT passed as props. `bookings`, `onViewChange`, `services`, and handler callbacks remain as props.

**Init flow in `App.tsx`:**
1. `supabase.auth.getSession()` → sets user
2. `supabase.auth.onAuthStateChange()` listens for `SIGNED_IN`, `PASSWORD_RECOVERY`, `SIGNED_OUT`
3. On sign-in → fetches `profiles` row → sets `isStaff` (admin flag)
4. If admin → loads all bookings; if customer → loads own bookings

`PASSWORD_RECOVERY` event triggers `forceRecoveryMode` — passed into `AuthProvider`, consumed by `AuthPage` via `useAuth()` to show the password reset form.

**Booking polling:** When `view === 'STATUS'` or `view === 'PROFILE'`, bookings refresh every 10 seconds. A `window.focus` listener also triggers a refresh.

---

## API Layer (`lib/api.ts`)

Central fetch wrapper with a 20-second timeout. All requests go to `VITE_API_URL` (defaults to `http://localhost:3001/api`).

```typescript
// Authenticated call pattern
const result = await api.someEndpoint(data, session.access_token)

// Public call pattern (no token)
const result = await api.getPublicData()
```

The Supabase JWT (`session.access_token`) is passed as `Authorization: Bearer <token>` for protected endpoints. Guest endpoints (status lookup, reupload) require no token — they are public and guarded by rate limiting + booking status checks.

All API functions throw on non-2xx or network error. Handle errors at the call site with try/catch.

---

## Booking Wizard (`components/BookingWizard.tsx`)

5-step flow driven by a `step` state (1–5):

| Step | Component | State Collected |
|---|---|---|
| 1 | `ServiceSelection` | `selectedService` |
| 2 | `VehicleSelection` | `vehicleType`, `vehicleSize`, `plateNumber` |
| 3 | Fuel type selector (LUBE only) | `fuelType` |
| 4 | `ScheduleSelection` | `selectedDate`, `selectedTimeSlot` |
| 5 | `PaymentForm` | `customerName`, `phone`, `email`, `paymentProofPath` |

Step 3 (fuel type) is skipped for non-LUBE services. Pricing is recalculated after each step.

**File upload pattern** (used in steps 5 and admin progress updates):
1. Call `api.getSignedUploadUrl(fileName, bookingId?, statusToken?, authToken?, fileSize?, mimeType?)` → get `{ uploadUrl, path }`
2. `fetch(uploadUrl, { method: 'PUT', body: file })` directly to Supabase Storage
3. Store `path` and send to backend in the booking/update payload

Pass `file.type || undefined` as `mimeType` so the backend can cross-check the MIME against the extension.

---

## Manila Timezone (`lib/bookingStatus.ts`)

**All date comparisons use `Asia/Manila` timezone.** Do not use `new Date()` directly for past/active booking logic. Use:

```typescript
import { isPastBooking, isActiveBooking } from '../lib/bookingStatus'
```

`isPastBooking(booking)` returns `true` if:
- status is `COMPLETED` or `CANCELLED`, OR
- status is not `IN_PROGRESS` AND the scheduled date+time has passed in Manila time

Never compare booking dates using raw JS date math — it will produce wrong results for Philippine users.

---

## Service Pricing Logic

Pricing source of truth is the **backend** (fetched via `api.getServices()`). `constants.ts` contains hardcoded fallback definitions used when the API fetch fails.

Price calculation in `BookingWizard.tsx`:
- LUBE (`isLubeFlat = true`): `lubePrices[fuelType]` — ignores vehicle size
- GROOMING/COATING: `price_small | price_medium | price_large | price_extra_large` by `vehicleSize`

Down payment displayed to customer = `totalPrice × 0.30`.

---

## AdminDashboard (`components/AdminDashboard.tsx`)

Largest file (~1000+ lines). Four tabs:
- **Bookings** — filterable table, capacity overview, booking detail modal (payment proof, status changes, progress updates, field edits)
- **Services & Rates** — price editor per service package
- **Memberships** — `MembershipsPanel.tsx`: "Make a Member" account-search flow (below), manage vehicles (add/remove, capped at 3), renew, cancel, view visit count and free-wash-credit balance
- **Settings** — `PaymentMethodSettings.tsx`: editable account name/number + QR upload per payment method (GCash, Bank Transfer); `ScheduleSettings.tsx`: default schedule, date overrides

## Club Wash & Go Memberships (customer-facing)

A membership can only be issued to an existing account — there's no blank "type a name" form. `MembershipsPanel.tsx`'s "Make a Member" button opens a multi-step modal:
1. **Search** — `api.searchMembershipCustomers(query, token)` finds an account by name/phone/email.
2. **Profile** — selecting a result shows their contact info plus `api.getCustomerCarwashHistory(userId, token)`, which is filtered server-side to `GROOMING` (car wash) bookings only — Lube/Ceramic bookings aren't part of what a membership tracks, so they're excluded from this view.
3. **Vehicles** — clicking "Make a Member" reveals the plate-registration form (1–3 vehicles, reused from the old standalone form), pre-filled with the account's name. Submitting calls `api.issueMembership({ memberName, userId, vehicles }, token)` — `userId` is required.

`MembershipStatusCard.tsx` is a shared presentational component (status badge, progress bar toward the next free wash or a "free wash ready" banner, first-wash-offer reminder, vehicle list) used in two places:
- `UserProfile.tsx` — auto-fetches the logged-in user's own membership via `api.getMyMembership(token)` on mount; shows a join-prompt card instead if the user isn't a member.
- `CheckStatus.tsx` — a guest-only "Membership" tab (`MembershipLookup`) alongside "Guest Lookup", looking up by membership number via `api.lookupMembership()`, mirroring the existing Booking ID lookup pattern.

In the booking wizard, `PaymentForm.tsx` fetches `api.getVehicleMembershipStatus(plateNumber)` and mirrors the backend's FREE_WASH → FIRST_WASH → CATEGORY_PERCENT discount priority rule client-side (display only) to show which discount applies and why in the pricing summary; the backend recomputes and applies the authoritative discount at booking creation. `ServicePackage.membershipDiscountPct` (from `api.getServices()`) carries the per-service discount tag used for the CATEGORY_PERCENT case. FREE_WASH/FIRST_WASH only ever apply to `GROOMING` (car wash) services — this mirrors the backend's category gate.

Admin actions call the backend API with `session.access_token`. The `AdminGuard` on the backend enforces the admin check server-side; the frontend hides admin UI based on `isStaff` but does not rely on it for security.

---

## Key Types (`types.ts`)

```typescript
enum BookingStatus { PENDING, PENDING_VERIFICATION, CONFIRMED, IN_PROGRESS, COMPLETED, CANCELLED, REUPLOAD_REQUIRED, REUPLOAD_SUBMITTED }
enum VehicleSize { SMALL, MEDIUM, LARGE, EXTRA_LARGE }
enum VehicleType { CAR = 'Car', MOTORCYCLE = 'Motorcycle' }  // string literals — NOT enum values
enum ServiceCategory { LUBE, GROOMING, COATING }
enum FuelType { GAS, DIESEL }
```

Note: `VehicleType` uses string literal values (`'Car'`, `'Motorcycle'`) in the frontend, but the backend expects `VEHICLE`/`MOTORCYCLE`. The mapping is done in `PaymentForm.tsx` before sending to the API.

---

## Styling

Tailwind CSS v4 (imported via Vite plugin, not PostCSS). Classes are standard Tailwind. No custom component library — all UI is hand-built. Animations use the `motion` package (Framer Motion v12).

No CSS modules or `styled-components`. All styles are inline Tailwind class strings on JSX elements.

---

## Path Alias

`@/` resolves to the root of `wash-and-go-SE2/`:
```typescript
import { supabase } from '@/lib/supabase'
import type { Booking } from '@/types'
```

Configured in `vite.config.ts` and `tsconfig.json`.

---

## Testing

### Unit tests (Vitest)

Located next to the source files. Current coverage:
- `lib/bookingStatus.test.ts` — tests for `isPastBooking()` and `isActiveBooking()` (Manila timezone logic)

Run with `npm run test` or `npx vitest` for watch mode.

### E2E tests (Playwright)

Specs live at `e2e/` in the **repo root** (not inside `wash-and-go-SE2/`). Config: `playwright.config.ts` (repo root).

Key config values:
- `workers: 1` — prevents parallel execution timeouts
- `timeout: 60_000` — 60-second test timeout
- `fullyParallel: false`
- `webServer` array auto-starts both backend (:3001) and frontend (:3000) if not already running

Run from repo root: `npx playwright test`

### Frontend view guard note

The `CLIENT` view (`BookingWizard`) no longer redirects unauthenticated guests — the frontend gate was removed as part of Plan A (guest booking flow). Guests can reach and complete the wizard without an account. The backend `POST /api/bookings` endpoint uses `OptionalAuthGuard` and has always supported guest creation.
