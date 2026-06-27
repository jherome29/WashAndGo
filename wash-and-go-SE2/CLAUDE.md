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
```

No linter or test runner is configured in the frontend — use TypeScript errors as the primary quality gate.

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
| `STATUS` | `CheckStatus` | Public (token-based guest access) |
| `AUTH` | `AuthPage` | Redirects away if already logged in |
| `PROFILE` | `UserProfile` | Auth required |

Navigation happens via `handleViewChange(view)` in `App.tsx`, which applies guards. To navigate programmatically anywhere in the app, call the `onViewChange` prop passed down from `App.tsx`.

---

## Auth State (`App.tsx`)

Auth state is initialized once on mount and kept at the root:

```typescript
const [user, setUser] = useState<User | null>(null)
const [profile, setProfile] = useState<Profile | null>(null)
const [isStaff, setIsStaff] = useState(false)    // true when profile.role === 'admin'
const [bookings, setBookings] = useState<Booking[]>([])
```

**Init flow:**
1. `supabase.auth.getSession()` → sets user
2. `supabase.auth.onAuthStateChange()` listens for `SIGNED_IN`, `PASSWORD_RECOVERY`, `SIGNED_OUT`
3. On sign-in → fetches `profiles` row → sets `isStaff`
4. If admin → loads all bookings; if customer → loads own bookings

`PASSWORD_RECOVERY` event triggers a special `recoveryMode` state that shows the password reset form in `AuthPage`.

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

The Supabase JWT (`session.access_token`) is passed as `Authorization: Bearer <token>` for protected endpoints. Guest endpoints use a `?token=` query param instead (status lookup, reupload).

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
1. Call `api.getSignedUploadUrl(fileName, bookingId?, token?)` → get `{ uploadUrl, path }`
2. `fetch(uploadUrl, { method: 'PUT', body: file })` directly to Supabase Storage
3. Store `path` and send to backend in the booking/update payload

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

Largest file (~1000+ lines). Three tabs:
- **Bookings** — filterable table, capacity overview, booking detail modal (payment proof, status changes, progress updates, field edits)
- **Services & Rates** — price editor per service package
- **Settings** — payment methods (GCash QR etc.), default schedule, date overrides

Admin actions call the backend API with `session.access_token`. The `AdminGuard` on the backend enforces the admin check server-side; the frontend hides admin UI based on `isStaff` but does not rely on it for security.

---

## Key Types (`types.ts`)

```typescript
enum BookingStatus { PENDING, PENDING_VERIFICATION, CONFIRMED, IN_PROGRESS, COMPLETED, CANCELLED, REUPLOAD_REQUIRED }
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
