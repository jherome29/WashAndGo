# Next Steps — CI/CD Follow-Ups

This originally tracked the initial CI/CD bring-up. CI, CD, and SonarCloud are now all live
(see `docs/CICD.md`) — what's left is verification/maintenance, not first-time setup. Confirm
each item's actual state in the relevant GitHub Settings page or Security tab before assuming
it's still open; this file can't observe that state directly.

---

## 1. CodeQL — ongoing alert triage

`.github/workflows/codeql.yml` runs GitHub's SAST scanner on push/PR to `main`/`develop`
plus weekly. It does **not** block merges (separate from `CI passed` on purpose — see
`docs/CICD.md`).

- [ ] Periodically check **Security tab → Code scanning alerts** and triage new findings
      (fix real issues, dismiss false positives with a reason). This is an ongoing task, not
      a one-time "review the first scan" step at this point.
- [ ] Once confident the signal is clean, consider adding **CodeQL** as a required status
      check alongside `CI passed` in branch protection (see §3) for stricter gating.

---

## 2. SonarCloud — done

The `sonarqube` CI job has been green across many merges (including dedicated fixes like
"make SonarQube quality gate check non-blocking" and coverage follow-up commits), which only
happens with a working `SONAR_TOKEN` secret and a correctly linked SonarCloud project. No
further setup action expected here — if the job starts failing, see `docs/CICD.md`'s SonarCloud
setup steps for troubleshooting.

---

## 3. Branch protection — verify in GitHub Settings

Can't be confirmed from the repo alone (it's a GitHub Settings UI setting, not a file). If not
already configured, go to Settings → Branches → Add rule, for each of `main` and `develop`:

- [ ] Require a pull request before merging
- [ ] Require status checks to pass → search and select **`CI passed`** (add **CodeQL**
      too, once its findings are triaged — see §1)
- [ ] Require branches to be up to date before merging
- (`main` only) Do not allow bypassing the above settings

---

## 4. Remaining team decisions

- [ ] **Track database migrations in git properly** — most `wash-and-go-backend/supabase/*.sql`
      scripts are already tracked in git (they predate the root `*.sql` gitignore rule, which
      doesn't retroactively untrack them), but `schedule-feature.sql` specifically is still
      missing from the repo, and none are organized as timestamped `supabase/migrations/` files.
      The CD pipeline's `migrate` job runs `supabase db push`, which assumes proper migration
      tracking — worth confirming what it actually applies today. See `docs/CD-BLUEPRINT.md` §4a
      and §6.
- [ ] **`*.sql` gitignore rule** — still in place at the repo root; relax it (or move
      migrations to an explicitly un-ignored `supabase/migrations/` path) once the above is
      resolved.
- [x] ~~Hand `docs/CD-BLUEPRINT.md` to the deployment teammate~~ — done; the CD pipeline
      described there is now implemented in `.github/workflows/cd.yml`.

---

## Quick reference

| Thing | Value |
|---|---|
| New repo | https://github.com/jherome29/WashAndGo |
| Old repo (untouched) | https://github.com/dreiiiiim/wash-and-go-front-back (`origin`) |
| New remote name locally | `washandgo` |
| Branch flow | `feature/<name> → develop → main` |
| Dependency updates | Manual (`npm outdated`) — Dependabot removed |
| CI secret (Sonar) | `SONAR_TOKEN` |
| Required check for branch protection | `CI passed` |
| CI file | `.github/workflows/ci.yml` |
| CodeQL file | `.github/workflows/codeql.yml` |
| CD file (implemented) | `.github/workflows/cd.yml` — see `docs/CICD.md` / `docs/CD-BLUEPRINT.md` |
