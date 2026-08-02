# CI/CD — How This Repo's Pipeline Works

This repo (`jherome29/WashAndGo`) is the CI/CD-enabled home of the Wash & Go system.

---

## Branching Model

Two long-lived branches, promoted in one direction:

```
feature/<name> ──PR──▶ develop ──PR──▶ main
                       (CI/tests gate  (production)
                        the merge)
```

| Branch | Purpose | CI | CD (future) |
|---|---|---|---|
| `develop` | Integration branch. Feature branches (e.g. `example1`) PR in here — full CI (lint, tests, security, quality gate) runs and must pass before merging. | ✅ full CI | none, or deploy to **staging** (teammate's call) |
| `main` | Production. Only receives promotions from `develop`. | ✅ full CI | deploy to **production** |

No dependency-update bot is configured — see "Dependency Updates" below.

---

## CI Pipeline (`.github/workflows/ci.yml`)

Runs on every push and PR to `main` and `develop`. Five jobs:

| Job | What it does |
|---|---|
| **backend** | `npm ci` → ESLint (no autofix) → Jest with coverage → `nest build`. Uploads `lcov.info`. |
| **frontend** | `npm ci` → ESLint → `tsc --noEmit` (vite build skips typechecking!) → Vitest with coverage → `vite build`. Uploads `lcov.info`. |
| **security** | Gitleaks secret scan over full git history (hard gate) + `npm audit` on both projects (informational — see note below). |
| **sonarqube** | Downloads both coverage artifacts, runs SonarQube scan, then **blocks on the quality gate**. Skipped on fork PRs (no secret access). |
| **ci-ok** | Aggregate job that fails if any of the above failed. Use this as the single required status check in branch protection. |

**npm audit note:** the backend has 2 known non-actionable advisory trees (`js-yaml` — test tooling only; `multer` — inside `@nestjs/platform-express` but no multer routes exist). Audit steps are `continue-on-error` so they inform without permanently blocking; review the logs when they go red.

---

## Required GitHub Secrets

Settings → Secrets and variables → Actions:

| Secret | Required for | Where to get it |
|---|---|---|
| `SONAR_TOKEN` | sonarqube job | SonarCloud: My Account → Security → Generate token. Self-hosted: user token from your SonarQube server. |
| `SONAR_HOST_URL` | only if self-hosted SonarQube | Your server URL. **Omit entirely for SonarCloud** (defaults to `https://sonarcloud.io`). |

`GITHUB_TOKEN` (used by gitleaks) is provided automatically by Actions.

## SonarCloud Setup (one-time)

1. Go to https://sonarcloud.io → log in with the `jherome29` GitHub account.
2. **+ → Analyze new project** → import `jherome29/WashAndGo`.
3. Check the generated **project key / organization** match `sonar-project.properties` (`jherome29_WashAndGo` / `jherome29`); edit the file if they differ.
4. Project **Administration → Analysis Method → turn OFF "Automatic Analysis"** — it conflicts with CI-based analysis and the build will error until disabled.
5. Generate a token, add it as the `SONAR_TOKEN` repo secret.

For **self-hosted SonarQube** instead: create the project manually with the same key, comment out `sonar.organization` in `sonar-project.properties`, and set both `SONAR_TOKEN` and `SONAR_HOST_URL` secrets.

---

## Dependency Updates

Dependabot is **not configured** in this repo — it was tried and removed because it opened
one branch + PR per package update across 4 ecosystems (root, backend, frontend, GitHub
Actions), cluttering the branch list with up to ~20 possible open PRs at once. Check for
outdated packages manually when you choose to:

```bash
cd wash-and-go-backend && npm outdated
cd wash-and-go-SE2 && npm outdated
```

Known vulnerabilities are still caught automatically regardless — the CI `security` job
runs `npm audit` on every push.

---

## Recommended Branch Protection (manual, one-time)

Settings → Branches → Add rule, for each of `main` and `develop`:

- ✅ Require a pull request before merging
- ✅ Require status checks to pass → select **`CI passed`** (the `ci-ok` job)
- ✅ Require branches to be up to date before merging
- (`main` only) ✅ Do not allow bypassing the above settings

---

## CodeQL (`.github/workflows/codeql.yml`)

GitHub's own SAST scanner — free on this repo since it's public (CodeQL/Advanced
Security only requires a paid license on private repos). Runs on push/PR to `main`/
`develop`, plus a weekly Monday scan (catches newly-published query coverage even in
weeks with no pushes). Uses the `security-extended` query pack, scoped by
`.github/codeql/codeql-config.yml` (excludes `node_modules`, `dist`, `coverage`,
Playwright artifacts).

**Deliberately a separate workflow from `ci.yml`, and NOT part of `ci-ok`:**
- It needs its own `security-events: write` permission — kept isolated from the main
  CI job's permission scope.
- Findings land in **Security tab → Code scanning alerts**, not in a PR-blocking check.
  This is intentional at first: CodeQL's `security-extended` pack can surface a batch
  of findings (including some false positives) on the first scan of an existing
  codebase, and you want to triage that baseline before it can block every merge.

**To promote it to a required check later** (once the initial findings are triaged):
Settings → Branches → edit the `main`/`develop` rule → add **"CodeQL"** (or the specific
`analyze` job) alongside `CI passed` in required status checks.

No secrets or setup needed — it runs on the default `GITHUB_TOKEN`.

---

## Running the Same Checks Locally

```bash
# Backend
cd wash-and-go-backend && npm run lint && npm run test:cov && npm run build

# Frontend
cd wash-and-go-SE2 && npm run lint && npx tsc --noEmit && npx vitest run --coverage && npm run build
```

---

## CD

Deployment is **intentionally not implemented** (`.github/workflows/cd.yml` is a stub).
The full design handed to the deployment owner is in **[docs/CD-BLUEPRINT.md](CD-BLUEPRINT.md)**.

## Known Gap

`.gitignore` excludes `*.sql`, so the one-time Supabase migration scripts under
`wash-and-go-backend/supabase/` (including `schedule-feature.sql`, required by the
Schedule Management feature) are **not in this repo** — they live only on the original
dev machine. Decide as a team whether to start tracking them (recommended once CD
handles migrations; see the blueprint).
