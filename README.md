# Wash & Go Auto Salon — Booking System

Full-stack online booking platform for Wash & Go Auto Salon, Baliwag Branch. Customers book detailing/lube/grooming services, track appointment status, and join the **Club Wash & Go** loyalty membership program; staff manage the schedule, payment review workflow, walk-in bookings, and memberships from an admin dashboard.

**Live app:** https://washandgo.autosalon.workers.dev  
**Backend API:** https://washandgoautosalon.up.railway.app/api

---

## Documentation

This README covers the user-facing manual and local setup. For deeper technical detail, see:

| Document | What it covers |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Monorepo overview, architecture, key tables, deployment |
| [docs/SYSTEM.md](docs/SYSTEM.md) | Full system logic — booking flow, pricing, slot capacity, payments, memberships, security |
| [docs/USER-STORIES.md](docs/USER-STORIES.md) | Manual QA checklist covering every user journey |
| [wash-and-go-backend/CLAUDE.md](wash-and-go-backend/CLAUDE.md) | Backend module map, auth guards, email patterns |
| [wash-and-go-SE2/CLAUDE.md](wash-and-go-SE2/CLAUDE.md) | Frontend routing, auth state, API layer |
| [docs/CICD.md](docs/CICD.md) | CI/CD pipeline (GitHub Actions, SonarQube, CodeQL) |

---

## User Manual

### For Customers

#### 1. Creating an Account / Logging In

1. Click **Login / Sign Up** in the top-right navigation.
2. Choose one of:
   - **Continue with Google** — one-click login using your Google account
   - **Sign up with email** — enter your full name, email, and password
   - **Log in** — if you already have an account
3. After logging in your name appears in the navbar and **My Bookings** becomes available.

#### 2. Booking a Service

1. Click **Book Now** in the navbar or on the home page.
2. **Step 1 — Select a Service**  
   Browse available packages (Basic Wash, Full Detail, Glass Detailing, etc.). Click a card to select it.
3. **Step 2 — Vehicle Details**  
   Enter your vehicle plate number and select vehicle size (Small / Medium / Large / Extra Large). Price updates automatically based on size.
4. **Step 3 — Schedule**  
   Pick a date from the calendar. Available time slots are shown based on remaining capacity. Select a slot.
5. **Step 4 — Contact Info**  
   Fill in your name and phone number (pre-filled if logged in).
6. **Step 5 — Payment**  
   - Review the required **down payment amount**.
   - Upload a screenshot of your GCash / payment proof.
   - Select your payment method.
   - Click **Submit Booking**.
7. A booking confirmation appears with your **Booking ID**. You don't need an account to book — guests can book and track using just the Booking ID.

#### 3. Tracking a Booking

**Option A — My Bookings (logged in)**  
Click **My Bookings** in the navbar to see all your bookings, current status, and any updates from staff.

**Option B — Check Status (no login needed)**  
Go to **Check Status** in the navbar and enter your Booking ID — no token or account required.

#### 4. Booking Statuses

| Status | Meaning |
|---|---|
| Pending | Submitted, no payment proof uploaded yet |
| Payment Review | Payment proof submitted, awaiting staff verification |
| Confirmed | Down payment verified, appointment locked |
| In Progress | Vehicle is being serviced |
| Completed | Service done |
| Cancelled | Booking was cancelled |
| Re-upload Required | Payment proof declined — re-upload needed |
| Proof Resubmitted | New payment proof uploaded, awaiting re-review |

#### 5. Re-uploading Payment Proof

If your payment is declined, go to **Check Status**, enter your Booking ID, and use the **Re-upload** button shown on a "Re-upload Required" booking. Upload a new screenshot and resubmit — no email link or token needed.

#### 6. Club Wash & Go Membership

A paid membership (issued in person at the shop) covering up to 3 vehicles, offering:
- A **free wash** every 10th car-wash visit
- **50% off** your first car wash as a new member
- Ongoing **percentage discounts** on select services (e.g. oil change, rust proofing, ceramic tinting/coating)

To become a member, visit the shop and speak with staff — a membership can only be added to an existing Wash & Go account, so sign up for an account first if you haven't already. Once issued:
- Your **Membership Status Card** appears on your Profile page, showing your progress toward the next free wash and your registered vehicles.
- Not logged in? Use the **Membership** tab on the **Check Status** page and enter your membership number (`CWG-######`, given to you when you joined) to check your status.
- Membership discounts are applied automatically at checkout when you enter a plate number registered to your membership — the pricing summary will show which discount applies.

---

### For Admin / Staff

#### Accessing the Admin Panel

Only accounts with admin/staff role can see the **Admin Panel** button in the navbar. Contact the system owner to have your account promoted.

#### Bookings Tab

- **Capacity Overview** — shows active slots for the selected date. Use the arrows or date picker to navigate days.
- **All Bookings table** — lists every booking. Filter by status, vehicle type, or date.
- **Manage** button on each row opens a modal to:
  - View full booking details, vehicle info, and payment proof image
  - Change the status (Confirm, Mark In Progress, Complete, Cancel)
  - Confirm or Decline payment with an optional decline reason
  - Add progress updates (message + optional images visible to the customer)

#### Services & Rates Tab

- Lists all service packages with per-vehicle-size pricing.
- Click **Edit** on any service to update name, description, or prices.
- Changes take effect immediately for new bookings.

#### Memberships Tab (Club Wash & Go)

- **Make a Member** — search for an existing customer account by name, phone, or email, review their car-wash history, then register up to 3 vehicle plates to issue a membership.
- View any membership's status, visit count, free-wash-credit balance, and registered vehicles.
- **Renew** — extend an expiring or expired membership by another year.
- **Cancel** — end a membership; its discounts stop applying immediately.
- **Manage Vehicles** — add or remove plates from an existing membership (max 3).

A membership can only be issued to a customer who already has a Wash & Go account — there's no walk-in-only signup path in the app.

#### Settings Tab

- **Payment Methods** — add/edit GCash numbers, account names, and QR images shown at checkout.
- **Schedule Settings** — set open/close times and per-slot capacity for each day of the week.
- **Date Overrides** — mark specific dates as closed or change their capacity (e.g. holidays).

---

## Deployment

Deploys are automated via GitHub Actions: CI runs on every push, and on success a separate CD workflow (`.github/workflows/cd.yml`) promotes `develop` → staging and `main` → production (migrate → deploy backend → deploy frontend → smoke test). See [docs/CICD.md](docs/CICD.md) and [docs/CD-BLUEPRINT.md](docs/CD-BLUEPRINT.md) for the full pipeline design.

### Frontend — Cloudflare Workers (static assets)

The frontend is a Cloudflare **Workers** project (`washandgo`) with static assets — not classic Cloudflare Pages. It deploys via `wash-and-go-SE2/wrangler.jsonc` + `npx wrangler deploy`.

| Setting | Value |
|---|---|
| Build command | `npm run build` (run from `wash-and-go-SE2/`) |
| Deploy command | `npx wrangler deploy` |
| Config file | `wash-and-go-SE2/wrangler.jsonc` |

**Required environment variables** (baked into the bundle at build time — set as CI variables, or in a local `.env` for manual builds):

```
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
VITE_API_URL=https://<your-railway-service>.up.railway.app/api
```

### Backend — Railway

Railway's builder is **Railpack**, not Nixpacks — `nixpacks.toml` in the repo root is legacy and unused. Build/start config is set directly on the Railway service: Root Directory `wash-and-go-backend`, Custom Build Command `npm run build`, Custom Start Command `npm run start:prod`.

**Required environment variables** (set in Railway dashboard):

```
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
CORS_ORIGINS=https://washandgo.autosalon.workers.dev
BREVO_API_KEY=<brevo-api-key>
BREVO_BASE_URL=https://api.brevo.com
BREVO_SENDER_EMAIL=<verified-sender@yourdomain.com>
BREVO_SENDER_NAME=Wash & Go Auto Salon
ADMIN_NOTIFICATION_EMAILS=<admin@yourdomain.com>
```

### Supabase

Set the **Site URL** and **Redirect URLs** in Supabase Auth settings:

- Site URL: `https://washandgo.autosalon.workers.dev`
- Additional redirect URLs: `http://localhost:3000`

---

## Local Development

### Prerequisites

- Node.js v18+
- A Supabase project
- A Brevo account (email)

### Quick start (both services at once, from repo root)

```bash
npm run install:all   # installs backend + frontend dependencies
npm run dev            # starts backend :3001 and frontend :3000 concurrently (PowerShell)
```

### Backend only

```bash
cd wash-and-go-backend
cp .env.example .env        # fill in your values
npm install
npm run start:dev           # runs on http://localhost:3001
```

### Frontend only

```bash
cd wash-and-go-SE2
# create .env with:
# VITE_SUPABASE_URL=...
# VITE_SUPABASE_ANON_KEY=...
# VITE_API_URL=http://localhost:3001/api
npm install
npm run dev                 # runs on http://localhost:3000
```

### Tests

```bash
cd wash-and-go-backend && npm test      # Jest
cd wash-and-go-SE2 && npm run test      # Vitest
npx playwright test                     # E2E, from repo root — both dev servers must be running
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS v4 |
| Backend | NestJS, TypeScript |
| Database / Auth | Supabase (PostgreSQL + Auth) |
| File Storage | Supabase Storage |
| Email | Brevo API |
| Frontend hosting | Cloudflare Workers (static assets) |
| Backend hosting | Railway |
| Testing | Jest (backend), Vitest (frontend), Playwright (E2E) |
| CI/CD | GitHub Actions — lint/test/build, gitleaks, npm audit, SonarQube quality gate, CodeQL, automated staging/production deploys |
