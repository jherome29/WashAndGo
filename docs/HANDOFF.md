# HANDOFF — Wash & Go Auto Salon

Pick-up document for a new Claude session. Read this top to bottom before doing anything.

---

## What This Project Is

Full-stack booking platform for **Wash & Go Auto Salon (Baliuag Branch)**.

- **Frontend:** React 18 + Vite + TypeScript (port 3000) — `wash-and-go-SE2/`
- **Backend:** NestJS REST API (port 3001) — `wash-and-go-backend/`
- **Database/Auth/Storage:** Supabase (project ref: `kgpwahbpjrnwswwevmlt`)
- **Live frontend:** https://wash-and-go-front-back.pages.dev
- **Live backend:** https://wash-and-go-front-back-production.up.railway.app/api

Start both services locally with `npm run dev` from repo root.

---

## Environment Notes

- **Node.js v24 on a Windows machine with SSL inspection** — all backend npm scripts already include `cross-env NODE_OPTIONS=--use-system-ca` so Supabase connections work. Do not remove this flag.
- **Email (Brevo):** `BREVO_API_KEY` is intentionally not set locally. The backend auto-confirms users on signup when the key is absent (see `auth.service.ts` — this was a deliberate fix). Email will only work on the deployed Railway backend.
- **Rate limiter:** The storage upload endpoint is throttled to 5 req/5min per IP. All localhost traffic shares one IP. If you hit "Too Many Requests" during testing, restart the backend with PowerShell: `powershell -Command "Get-Process -Name node | Stop-Process -Force"` then `npm run dev`.

---

## What Was Completed in Prior Sessions

### 1. Security Hardening (spec written, implementation NOT started)

A 9-item security hardening design spec was written and is at:
`docs/superpowers/specs/2026-06-27-security-hardening-design.md`

**Items covered:** CSP headers, request body size limit, Permissions-Policy, file upload size enforcement, error message sanitization, auth rate limiting hardening, npm audit, honeypot field on booking creation, status token rotation on reupload.

**Status: NOT IMPLEMENTED.** The spec is ready and approved. To implement, invoke the `writing-plans` skill first to generate a step-by-step implementation plan, then execute it.

### 2. Deferred Security Items (need Supabase tables)

Two items from the security spec require creating Supabase tables first. The SQL and implementation code are fully written out in `docs/PENDING.md` sections 2a and 2b:

- **DB-Backed Password Reset Rate Limiting** — current implementation uses in-memory `Map`, resets on server restart. SQL + replacement code is in `docs/PENDING.md`.
- **Admin Audit Log** — logs admin actions (confirm payment, decline, status changes, price edits). SQL + `AuditLogService` code is in `docs/PENDING.md`.

### 3. Security Test Results

All 7 planned security tests were run and verified. Results are in `docs/PENDING.md` Section 3. Everything passed.

### 4. Bug Fixes Applied (this session — 2026-06-27)

Six bugs were found and fixed in this session:

| Bug | Files Changed | What Was Fixed |
|-----|--------------|----------------|
| 4PM slot mislabeled "Fully Booked" | `bookings.service.ts`, `ScheduleSelection.tsx` | Backend now filters out slots where `slot + duration > closeTime` entirely instead of returning them as `available: false`. Frontend label was downstream of this. |
| API allowed booking impossible slots | `bookings.service.ts:create()` | Added `slotFitsBeforeClose()` + `is_closed` validation at booking creation — direct API calls can no longer book past closing time |
| Dead code `ACTIVE_STATUSES` constant | `bookings.service.ts:15` | Deleted the unused constant |
| Admin bookings list sort broken | `AdminDashboard.tsx:579` | `new Date("2026-06-27T10:00 AM")` → Invalid Date → sort was non-deterministic. Fixed with `parseSlotToMins()` helper |
| Admin capacity overview sort broken | `AdminDashboard.tsx:598` | Same Invalid Date issue, same fix |

**These changes are NOT committed to git yet.**

---

## What Is Left To Do (Recommended Order)

### Priority 1 — Implement the Security Spec

The spec at `docs/superpowers/specs/2026-06-27-security-hardening-design.md` is approved and ready. Steps:

1. Invoke the `writing-plans` skill
2. Implement all 9 items from the spec
3. Run `npm audit fix --only=prod` in both sub-projects (part of item 9)
4. Build + verify both projects compile

### Priority 2 — Deferred Security Items (need DB tables)

Run the SQL from `docs/PENDING.md` Section 2 in your Supabase dashboard, then implement the code as written there.

### Priority 3 — Code Quality Tools

All details in `docs/PENDING.md` Section 4, in this order:

1. ESLint for frontend (`wash-and-go-SE2/`) — no linter exists at all right now
2. Backend unit tests (Jest is installed, no tests written) — start with `stripHtml` and slot logic
3. Vitest for frontend
4. Playwright E2E for 4 key flows (guest booking, reupload, admin payment confirm, walk-in)
5. GitHub Actions CI

---

## Key Files to Know

| File | Why It Matters |
|------|----------------|
| `docs/SYSTEM.md` | Complete logic for every feature — read this before touching any cross-layer code |
| `wash-and-go-backend/CLAUDE.md` | Backend module map, auth patterns, email patterns |
| `wash-and-go-SE2/CLAUDE.md` | Frontend routing, auth state, API layer, Manila timezone |
| `docs/superpowers/specs/2026-06-27-security-hardening-design.md` | Approved security spec waiting for implementation |
| `docs/PENDING.md` | Deferred items with complete SQL and implementation code ready to paste |
| `wash-and-go-backend/src/bookings/bookings.service.ts` | Core booking logic — slot availability, pricing, status flow |
| `wash-and-go-SE2/components/ScheduleSelection.tsx` | Customer-facing time slot picker |
| `wash-and-go-SE2/components/AdminDashboard.tsx` | Admin UI (~1000 lines) — bookings, pricing, settings |

---

## Known Technical Debt (from SYSTEM.md, unchanged)

- Password reset rate-limiting is in-memory (resets on Railway restart) — fix is written in `docs/PENDING.md`
- `shop_settings` table in DB is unused — ignore it, `branch_schedules` is authoritative
- Vehicle type mismatch: frontend uses `'Car'`/`'Motorcycle'`, backend uses `VEHICLE`/`MOTORCYCLE` — mapping in `PaymentForm.tsx`
- `OilType` field stored on bookings but not used in pricing

---

## Uncommitted Changes As Of This Handoff

Run `git diff --stat` to see. The changes are:
- `wash-and-go-backend/src/bookings/bookings.service.ts` — 4 bugs fixed (see above)
- `wash-and-go-SE2/components/AdminDashboard.tsx` — 2 sort bugs fixed (see above)
- Previously modified but not committed: `wash-and-go-backend/package.json`, `wash-and-go-SE2/App.tsx`, `wash-and-go-SE2/components/CheckStatus.tsx`, `wash-and-go-backend/src/bookings/bookings.service.ts` (earlier changes), `wash-and-go-backend/src/auth/auth.service.ts`, `wash-and-go-backend/src/email/email.service.ts`

Consider committing everything with a message like: "fix: slot availability, sort, and security hardening from previous sessions"
