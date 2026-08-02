# Next Steps — Finish the CI/CD Setup

Ordered by priority. Do them top to bottom — later items assume earlier ones are done.

---

## 1. CodeQL — review the first scan

`.github/workflows/codeql.yml` runs GitHub's SAST scanner on push/PR to `main`/`develop`
plus weekly. It does **not** block merges yet (separate from `CI passed` on purpose —
see `docs/CICD.md`).

- [ ] After the first run completes, check **Security tab → Code scanning alerts** and
      triage whatever it finds (fix real issues, dismiss false positives with a reason).
- [ ] Once the baseline is clean, optionally add **CodeQL** as a required status check
      alongside `CI passed` in branch protection (Step 3 below) for stricter gating.

---

## 2. SonarCloud (blocking — do this next)

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

---

## 3. Branch protection (after Steps 1–2 are green)

GitHub repo → Settings → Branches → Add rule, for each of `main` and `develop`:

- [ ] Require a pull request before merging
- [ ] Require status checks to pass → search and select **`CI passed`** (add **CodeQL**
      too, once its baseline findings are triaged)
- [ ] Require branches to be up to date before merging
- [ ] (`main` only) Do not allow bypassing the above settings

Doing this before Steps 1–2 blocks every merge on jobs that are expected to fail.

---

## 4. Team decisions (no rush)

- [ ] **Track database migrations in git** — consider pulling the real schema (via
      `supabase db dump`) and committing it as `supabase/migrations/` instead of letting
      it live only in the Supabase dashboard. This is also what `docs/CD-BLUEPRINT.md`
      §4a assumes once CD is built.
- [ ] **`*.sql` gitignore rule** — currently excludes all SQL files repo-wide, including
      `wash-and-go-backend/supabase/schedule-feature.sql` (already run against
      production — this is only about whether the *file* gets tracked in git, not
      whether the feature works). Relax this rule once you decide to track migrations.
- [ ] **Hand `docs/CD-BLUEPRINT.md` to the deployment teammate** — full design for
      staging/production environments, Railway + Cloudflare + Supabase job skeletons,
      smoke tests, rollback, and the secrets checklist. Staging maps to `develop`,
      production to `main`.

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
| CD stub (teammate's) | `.github/workflows/cd.yml` + `docs/CD-BLUEPRINT.md` |
