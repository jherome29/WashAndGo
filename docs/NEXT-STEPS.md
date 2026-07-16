# Next Steps — Finish the CI/CD Setup

Everything below is what remains to be done by hand, in order. The pipeline code is
already committed on the local `cicd-setup` branch (commit `78cf889`); nothing works
until Step 1 is done.

---

## 1. Push the three branches to the new repo (BLOCKED — must be run by you)

The `washandgo` remote is already configured. Run, **in this order** (`main` first —
the first branch pushed to an empty repo becomes its default):

```bash
git push -u washandgo cicd-setup:main
git push washandgo cicd-setup:develop cicd-setup:test
```

This creates `main`, `develop`, and `test` on https://github.com/jherome29/WashAndGo
from the same commit. CI will start running immediately on the push — **expect the
`sonarqube` job to FAIL on this first run** (Step 2 fixes that).

---

## 2. Set up SonarCloud (fixes the failing `sonarqube` job)

1. Go to https://sonarcloud.io → log in with GitHub (`jherome29`).
2. **+ → Analyze new project** → import `jherome29/WashAndGo`.
3. Compare the project key/organization SonarCloud generated with what's in
   `sonar-project.properties` (`jherome29_WashAndGo` / `jherome29`).
   If they differ, edit the file to match and push again.
4. In the Sonar project: **Administration → Analysis Method → turn OFF
   "Automatic Analysis"**. The scan will error with a conflict message until this is off.
5. My Account → Security → **Generate token**.
6. GitHub repo → Settings → Secrets and variables → Actions → **New repository secret**:
   - Name: `SONAR_TOKEN`, Value: the token.
   - Do **NOT** add `SONAR_HOST_URL` (it defaults to sonarcloud.io — only self-hosted
     SonarQube needs it).
7. Re-run the failed workflow (Actions tab → failed run → "Re-run failed jobs").

---

## 3. Watch the first green-ish run — known things that may need fixing

Things to check when CI runs for the first time. Fix in a PR to `develop`, or push
directly while branch protection isn't enabled yet.

- [ ] **Backend lint job** — CI runs ESLint *without* `--fix` (unlike `npm run lint`
      locally). There is one known pre-existing error: unused `userId` param in
      `reuploadProof()` (`bookings.service.ts`). If the job fails on it, either fix
      the param (prefix `_userId`) or add an eslint-disable comment.
- [ ] **Gitleaks job** — scans the FULL git history, not just the new commit. If any
      old commit ever contained a key/token, it will flag it. Rotate the real secret
      first, then add a `.gitleaksignore` entry for the finding's fingerprint.
- [ ] **SonarQube quality gate** — the default "Sonar way" gate requires ~80% coverage
      on new code and no new issues. The first scan sets the baseline and usually
      passes; later PRs may fail the gate legitimately. Adjust the gate in SonarCloud
      (Quality Gates) if it's too strict for the team right now.
- [ ] **Frontend coverage numbers are low** — only `lib/bookingStatus.ts` has unit
      tests. Not a failure by itself, but it feeds the Sonar gate. Adding tests for
      `lib/api.ts` helpers and `constants.ts` would be the cheapest wins.
- [ ] **npm audit steps** — informational only (yellow, never red). The two known
      backend advisories (`js-yaml` test-only, `multer` unused routes) are expected.

---

## 4. Turn on branch protection (after CI is green)

GitHub repo → Settings → Branches → Add rule, for each of `main`, `test`, `develop`:

- [ ] Require a pull request before merging
- [ ] Require status checks to pass → search and select **`CI passed`**
- [ ] Require branches to be up to date before merging
- [ ] (`main` only) Do not allow bypassing the above settings

Do this **after** Steps 2–3, or every merge will be blocked by the failing Sonar job.

---

## 5. Team decisions (no rush)

- [ ] **`*.sql` gitignore rule** — the Supabase migration scripts (including
      `wash-and-go-backend/supabase/schedule-feature.sql`, required by the Schedule
      Management feature) are NOT in the new repo because `.gitignore` excludes them.
      They only exist on this machine. Decide whether to track them (recommended —
      see `docs/CD-BLUEPRINT.md` §4a, migrations must be in git before CD can run them).
- [ ] **Hand `docs/CD-BLUEPRINT.md` to the deployment teammate** — it has the full
      design: staging/production environments, Railway + Cloudflare + Supabase job
      skeletons, smoke tests, rollback, and the secrets checklist.
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
| Required secret | `SONAR_TOKEN` (SonarCloud token) |
| Required check for protection | `CI passed` |
| CI file | `.github/workflows/ci.yml` |
| CD stub (teammate's) | `.github/workflows/cd.yml` + `docs/CD-BLUEPRINT.md` |
