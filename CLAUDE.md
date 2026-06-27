# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Key Reference Documents

| Document | What it covers |
|---|---|
| **[docs/SYSTEM.md](docs/SYSTEM.md)** | How the system actually works — complete logic for every feature: booking creation, pricing, slot availability, payment proof flow, status tokens, admin operations, email triggers, auth flows, storage access, schedule overrides |
| **[wash-and-go-backend/CLAUDE.md](wash-and-go-backend/CLAUDE.md)** | Backend module map, Supabase client usage, auth guards, email patterns, CORS config |
| **[wash-and-go-SE2/CLAUDE.md](wash-and-go-SE2/CLAUDE.md)** | Frontend view routing, auth state machine, API layer, Manila timezone, Booking Wizard steps |

Read `docs/SYSTEM.md` first when working on any feature that spans multiple layers.

---

## What This Is

Full-stack booking platform for **Wash & Go Auto Salon** (Baliuag Branch). Customers book detailing/lube/grooming services and track appointment status; admins manage the schedule, payment review workflow, and walk-in bookings from a dashboard.

- **Live frontend:** https://wash-and-go-front-back.pages.dev
- **Live backend:** https://wash-and-go-front-back-production.up.railway.app/api
- **Database/Auth/Storage:** Supabase (project ref: `kgpwahbpjrnwswwevmlt`)

---

## Monorepo Structure

```
/
├── wash-and-go-backend/   NestJS REST API (port 3001)
├── wash-and-go-SE2/       React + Vite SPA (port 3000)
├── scripts/dev.ps1        PowerShell: starts both services concurrently
├── nixpacks.toml          Railway deployment config (backend only)
└── package.json           Root scripts: dev, install:all, build
```

Each sub-project has its own `package.json`, `node_modules`, and `.env`.

---

## Commands

### Install all dependencies (run once after cloning)
```bash
npm run install:all
```

### Run both services simultaneously (Windows/PowerShell)
```bash
npm run dev
```
Backend starts on `http://localhost:3001/api`, frontend on `http://localhost:3000`.

### Run services individually
```bash
# Backend (from repo root or wash-and-go-backend/)
cd wash-and-go-backend && npm run start:dev

# Frontend (from repo root or wash-and-go-SE2/)
cd wash-and-go-SE2 && npm run dev
```

### Build for production
```bash
npm run build
# or individually:
cd wash-and-go-backend && npm run build    # outputs to wash-and-go-backend/dist/
cd wash-and-go-SE2 && npm run build        # outputs to wash-and-go-SE2/dist/
```

### Backend: lint and format
```bash
cd wash-and-go-backend
npm run lint      # ESLint + auto-fix
npm run format    # Prettier
```

### Backend: tests
```bash
cd wash-and-go-backend
npm test                  # run all tests
npm run test:watch        # watch mode
npm run test:cov          # with coverage
```

---

## Environment Variables

### Backend — `wash-and-go-backend/.env`
```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=      # bypasses RLS — used by admin operations
PORT=3001
FRONTEND_URL=http://localhost:3000
CORS_ORIGINS=http://localhost:3000   # comma-separated for multiple
CORS_ALLOW_VERCEL=false

BREVO_API_KEY=
BREVO_BASE_URL=https://api.brevo.com
BREVO_SENDER_EMAIL=
BREVO_SENDER_NAME=Wash & Go Auto Salon
BREVO_TIMEOUT_MS=15000
ADMIN_NOTIFICATION_EMAILS=       # comma-separated, receives booking alerts
```

### Frontend — `wash-and-go-SE2/.env`
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_API_URL=http://localhost:3001/api
```

---

## System Architecture

### Data Layer

All persistence is **Supabase (PostgreSQL)**. The backend holds two Supabase clients:
- **Anon client** — respects RLS; used for auth token verification
- **Admin client (service role)** — bypasses RLS; used for all DB reads/writes in services

The frontend has a minimal Supabase client used only for auth session management and listening to auth events. All business data goes through the NestJS API, not Supabase JS directly.

### Key Database Tables

| Table | Purpose |
|---|---|
| `profiles` | Supabase auth user metadata; `role` column (`admin`/`user`) drives authorization |
| `services` | Service packages — LUBE, GROOMING, COATING; pricing stored here and editable via admin |
| `bookings` | All booking records; `status_token_hash` enables guest status lookups |
| `booking_updates` | Admin progress notes with optional image attachments |
| `payment_settings` | GCash/bank payment methods with QR image paths |
| `branch_schedules` | Single row (`id='default'`) — shop open/close time and slot interval |
| `schedule_overrides` | Per-date exceptions (closures, custom hours) |

### Auth & Authorization

- **Supabase Auth** handles login, signup, Google OAuth, and JWT issuance
- The backend validates JWTs via `AuthGuard` (extracts from `Authorization: Bearer <token>`)
- `OptionalAuthGuard` allows unauthenticated requests (booking creation, guest status check)
- Admin operations check `profiles.role === 'admin'` after token validation
- Guests (not logged in) access their bookings via a **48-hour status token**: SHA256 hash stored in DB, plaintext returned once on booking creation

### Service Categories & Pricing

Three categories with different pricing models:
- **LUBE** — flat price by fuel type (GAS vs DIESEL); vehicle size ignored; `is_lube_flat=true`
- **GROOMING** — price by vehicle size (SMALL/MEDIUM/LARGE/EXTRA_LARGE)
- **COATING** — price by vehicle size

Down payment is always 30% of total price (`DOWN_PAYMENT_PERCENTAGE = 0.30`).

### Slot Availability & Capacity

Capacity is defined per service **category** (not per service):
```
LUBE: 1 concurrent booking per slot
GROOMING: 2 concurrent bookings per slot
COATING: 2 concurrent bookings per slot
```

Availability is determined by:
1. Fetch schedule for the date (override first, then `branch_schedules` default)
2. Generate 1-hour slots from open → close time, excluding slots where `slot_start + service_duration > close_time`
3. Count active bookings in those slots: statuses `PENDING_VERIFICATION`, `CONFIRMED`, `IN_PROGRESS` consume capacity

### Walk-In Booking Mode

Admin-created bookings (detected via `isAdmin(userId)`) skip payment proof and are auto-set to `CONFIRMED`. No special DB flag — the bypass happens entirely at service layer based on who creates the booking.

### Email Notifications (Brevo)

All email sends are **fire-and-forget** (`void emailService.send*()`). Failures are logged but never bubble up to the API response. Templates use inline HTML with branded header/footer. Admin notification recipients come from `ADMIN_NOTIFICATION_EMAILS` env var.

---

## Booking Status Flow

```
(new booking)
      │
      ▼
PENDING_VERIFICATION ──── admin confirms ────▶ CONFIRMED ──▶ IN_PROGRESS ──▶ COMPLETED
      │                                              ▲
      ├── admin declines ──▶ REUPLOAD_REQUIRED ─────┘ (customer re-uploads)
      │
      └── (any state) ──▶ CANCELLED
```

Walk-in bookings skip directly to `CONFIRMED`.

---

## Deployment

| Layer | Host | Trigger |
|---|---|---|
| Frontend | Cloudflare Pages | Push to `main` |
| Backend | Railway | Push to `main` |
| Database/Auth/Storage | Supabase | Manual |

Railway reads `nixpacks.toml` from the repo root; it only builds and starts `wash-and-go-backend/`.

For Supabase Auth to work with the production frontend, set **Site URL** and **Redirect URLs** in the Supabase Auth dashboard to include `https://wash-and-go-front-back.pages.dev` and `http://localhost:3000`.

---

## Known Technical Debt

- **Password reset rate-limiting is in-memory** (`Map` in `AuthService`) — resets on server restart; a DB-backed approach would be more reliable.
- **`shop_settings` table is unused** — `branch_schedules` is the authoritative schedule table; `shop_settings` is a leftover and can be ignored.
- **Vehicle type inconsistency** — frontend uses string literals `'Car'`/`'Motorcycle'`; backend uses enum `VEHICLE`/`MOTORCYCLE`. A mapping happens in `PaymentForm.tsx`.
- **`OilType` field stored but not used** — stored on bookings for LUBE services but has no effect on pricing logic.
- **No booking cancellation workflow** — status can be set to `CANCELLED` by admin but there is no refund or re-booking logic.
