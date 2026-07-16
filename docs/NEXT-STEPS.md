# Next Steps — Finish the CI/CD Setup

Ordered by priority. Do them top to bottom — later items assume earlier ones are done.

---

## 1. SonarCloud (blocking — do this first)

Without this, the `sonarqube` job errors on every run and `CI passed` stays red.

1. Go to https://sonarcloud.io → log in with GitHub (`jherome29`).
2. **+ → Analyze new project** → import `jherome29/WashAndGo`.
3. Compare the project key/organization SonarCloud generated with what's in
   `sonar-project.properties` (`jherome29_WashAndGo` / `jherome29`).
   If they differ, edit the file to match and push again.
4. In the Sonar project: **Administration → Analysis Method → turn OFF
   "Automatic Analysis"**. The scan errors with a conflict message until this is off.
5. My Account → Security → **Generate token**.
6. GitHub repo → Settings → Secrets and variables → Actions → **New repository secret**:
   - Name: `SONAR_TOKEN`, Value: the token.
   - Do **NOT** add `SONAR_HOST_URL` (defaults to sonarcloud.io — only self-hosted needs it).
7. Re-run the failed workflow (Actions tab → failed run → "Re-run failed jobs").

**Status:** `backend` and `frontend` jobs are already verified passing (lint, tests,
build all confirmed locally, including two real fixes already pushed — the unused
`userId` param removal and the ESLint `coverage/` ignore fix). Once Sonar is wired up,
`CI passed` should go fully green.

---

## 2. Playwright E2E in CI (new — added, but disabled until you finish this)

An `e2e` job now exists in `.github/workflows/ci.yml`. It's **safe already** — it only
runs on pushes/PRs targeting `test` or `main` (not `develop`, to keep everyday CI fast),
and only when the `E2E_ENABLED` repo variable is `true`. Until you finish the steps
below, it stays off and doesn't affect anything.

### Why this needs real setup (not just flipping a switch)

Your 4 existing specs (`e2e/*.spec.ts`) need: a running backend + frontend (CI does this
automatically via `playwright.config.ts`'s `webServer`), a Supabase project with the full
schema and at least one active service + operating hours, and two real login accounts
(admin + regular customer).

**Important finding:** you can't rebuild that schema from the SQL files in
`wash-and-go-backend/supabase/`. I checked — `schema.sql` only creates `profiles`,
`services`, and `bookings`. Six other tables (`branch_schedules`, `schedule_overrides`,
`payment_settings`, `booking_updates`, `admin_audit_logs`, `password_reset_attempts`)
were created directly in the Supabase dashboard at some point and were never saved as
SQL anywhere in this repo. So instead of running scattered scripts, **pull the real
schema from production** — this is also more accurate and doubles as prep for the CD
migration work in `docs/CD-BLUEPRINT.md`.

### Step-by-step

1. **Create a new, separate Supabase project** (free tier) — call it something like
   `wash-and-go-test`. Never point E2E at your real production project; these tests
   create real bookings, decline payments, etc.

2. **Copy the production schema into it**, using the Supabase CLI from this machine:
   ```bash
   npx supabase login
   npx supabase link --project-ref kgpwahbpjrnwswwevmlt   # your real project
   npx supabase db dump --schema public -f prod-schema.sql
   npx supabase link --project-ref <your-new-test-project-ref>
   npx supabase db push --db-url <test-project-connection-string> < prod-schema.sql
   ```
   (Get the test project's connection string from Supabase Dashboard → Project Settings
   → Database.) This brings over every table, RLS policy, and trigger — including the
   6 tables missing from the tracked SQL files.

3. **Seed minimum data** the specs need to find bookable slots, via the test project's
   Table Editor (or SQL Editor):
   - `branch_schedules`: one row, `open_time='08:00'`, `close_time='17:00'`,
     `slot_interval_h=1`, `closed_days='[]'`.
   - `services`: at least one row with `category='GROOMING'`, `is_active=true`, real
     prices — easiest is to copy one row from production's `services` table by hand
     (Table Editor → your prod project → copy the row values).

4. **Create two Supabase Auth users** in the test project (Dashboard → Authentication →
   Add user, or sign up through the app running locally against the test project):
   - One **admin**: after creating, in `profiles` table set that user's `role` to `admin`.
   - One **regular customer**: leave `role` as `customer`.

5. **Add 8 secrets** to GitHub repo → Settings → Secrets and variables → Actions:

   | Secret | Value |
   |---|---|
   | `E2E_SUPABASE_URL` | test project's URL |
   | `E2E_SUPABASE_ANON_KEY` | test project's anon key |
   | `E2E_SUPABASE_SERVICE_ROLE_KEY` | test project's service role key |
   | `E2E_ADMIN_EMAIL` | the admin account's email |
   | `E2E_ADMIN_PASSWORD` | the admin account's password |
   | `E2E_USER_EMAIL` | the regular account's email |
   | `E2E_USER_PASSWORD` | the regular account's password |

6. **Add 1 repo variable** (Settings → Secrets and variables → Actions → **Variables**
   tab, not Secrets): `E2E_ENABLED` = `true`.

7. Push anything to `test` (or open a PR into it) and watch the `e2e` job run. If a
   spec fails, download the `playwright-report` artifact from the failed run — it has
   screenshots/traces of exactly where it broke.

**Note:** all 4 specs gracefully `test.skip()` if the admin/user credentials aren't set —
so nothing breaks if you do the secrets in a different order, but the servers still need
`E2E_SUPABASE_URL`/`E2E_SUPABASE_ANON_KEY`/`E2E_SUPABASE_SERVICE_ROLE_KEY` to even boot in
step 3 of the pipeline, so those three can't be skipped.

---

## 3. Branch protection (after Steps 1–2 are green)

GitHub repo → Settings → Branches → Add rule, for each of `main`, `test`, `develop`:

- [ ] Require a pull request before merging
- [ ] Require status checks to pass → search and select **`CI passed`**
- [ ] Require branches to be up to date before merging
- [ ] (`main` only) Do not allow bypassing the above settings

Doing this before Steps 1–2 blocks every merge on jobs that are expected to fail/skip.

---

## 4. Team decisions (no rush)

- [ ] **Track database migrations in git** — now that you've pulled the real schema
      (Step 2), consider committing it as `supabase/migrations/` instead of letting it
      live only on this machine. This is also what `docs/CD-BLUEPRINT.md` §4a assumes
      once CD is built.
- [ ] **`*.sql` gitignore rule** — currently excludes all SQL files repo-wide, including
      `wash-and-go-backend/supabase/schedule-feature.sql` (needed by the Schedule
      Management feature — still only exists on this machine, not in either repo).
      Relax this rule once you decide to track migrations.
- [ ] **Hand `docs/CD-BLUEPRINT.md` to the deployment teammate** — full design for
      staging/production environments, Railway + Cloudflare + Supabase job skeletons,
      smoke tests, rollback, and the secrets checklist.
- [ ] **Local branch cleanup** — this machine's `cicd-setup` branch tracks
      `washandgo/main`. The `post-defense` branch still tracks the old repo (`origin`)
      and is untouched. Once the team fully moves to the new repo, new work should
      branch off `develop` there.

---

## Quick reference

| Thing | Value |
|---|---|
| New repo | https://github.com/jherome29/WashAndGo |
| Old repo (untouched) | https://github.com/dreiiiiim/wash-and-go-front-back (`origin`) |
| New remote name locally | `washandgo` |
| Branch flow | `feature/* → develop → test → main` |
| CI secret (Sonar) | `SONAR_TOKEN` |
| CI secrets (E2E, 7 total) | `E2E_SUPABASE_URL`, `E2E_SUPABASE_ANON_KEY`, `E2E_SUPABASE_SERVICE_ROLE_KEY`, `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`, `E2E_USER_EMAIL`, `E2E_USER_PASSWORD` |
| CI variable (E2E on/off) | `E2E_ENABLED` = `true` |
| Required check for branch protection | `CI passed` |
| CI file | `.github/workflows/ci.yml` |
| CD stub (teammate's) | `.github/workflows/cd.yml` + `docs/CD-BLUEPRINT.md` |
