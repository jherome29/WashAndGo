# CD Blueprint — Deployment Pipeline Design

> **Audience:** the teammate implementing deployment. Nothing here is built yet —
> `.github/workflows/cd.yml` is a stub. This document is the agreed design to build against.

---

## 1. Environment Model

Two deployed environments, mapped to the two promotion branches:

```
 branch: test                          branch: main
┌─────────────────────────┐          ┌─────────────────────────┐
│        STAGING          │  promote │       PRODUCTION        │
│ Railway (staging svc)   │ ───PR──▶ │ Railway (prod service)  │
│ CF Pages (preview proj) │          │ CF Pages (prod project) │
│ Supabase (test project) │          │ Supabase (live project) │
└─────────────────────────┘          └─────────────────────────┘
```

- **Staging needs its own Supabase project** (free tier is fine). Never point staging at the
  production database — E2E/QA runs create bookings, decline payments, etc.
- Current production infra (already live): Railway `wash-and-go-front-back-production`,
  Cloudflare Pages `wash-and-go-front-back`, Supabase project `kgpwahbpjrnwswwevmlt`.
- **Prerequisite:** disconnect Railway's and Cloudflare's built-in "watch the git repo" auto-deploy
  once this pipeline exists, or you'll get double deploys racing each other.

## 2. Pipeline Flow (per environment)

```
CI "CI passed" green on test/main
        │
        ▼
┌── 1. migrate ──┐   ┌── 2. deploy-backend ──┐   ┌── 3. deploy-frontend ──┐
│ supabase db    │──▶│ railway up            │──▶│ npm run build +        │
│ push (linked   │   │ (staging/prod svc)    │   │ wrangler pages deploy  │
│ to env's proj) │   └───────────────────────┘   └────────────────────────┘
└────────────────┘                                          │
                                                            ▼
                                            ┌── 4. smoke test ───────────┐
                                            │ GET  {api}/api/health=200  │
                                            │ GET  {frontend}/ = 200     │
                                            │ GET  {api}/api/services    │
                                            │      returns JSON array    │
                                            └────────────┬───────────────┘
                                                 pass ✅ │ fail ❌
                                                    done │ rollback + alert
```

**Order matters:** migrations first (new columns must exist before new code reads them —
e.g. `closed_days`), backend second, frontend last (it consumes the API).

## 3. Trigger Design

```yaml
on:
  workflow_run:
    workflows: [CI]
    branches: [test, main]
    types: [completed]

jobs:
  deploy:
    if: github.event.workflow_run.conclusion == 'success'
    environment: ${{ github.event.workflow_run.head_branch == 'main' && 'production' || 'staging' }}
```

Use **GitHub Environments** (Settings → Environments → create `staging` and `production`):
- Scope each secret to its environment — the same secret *name* holds different values per env.
- On `production`, enable **required reviewers** so a human approves every prod deploy.

## 4. Job Skeletons

### 4a. Database migrations (Supabase CLI)

```yaml
migrate:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: supabase/setup-cli@v1
    - run: supabase link --project-ref ${{ vars.SUPABASE_PROJECT_REF }}
      env: { SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }} }
    - run: supabase db push
      env: { SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }} }
```

**Prerequisite:** migrations must move into `supabase/migrations/` (timestamped files, tracked
in git) instead of ad-hoc scripts pasted into the SQL Editor. Note `.gitignore` currently
excludes `*.sql` — that rule must be relaxed for the migrations directory.

### 4b. Backend → Railway

```yaml
deploy-backend:
  needs: migrate
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - run: npm i -g @railway/cli
    - run: railway up --service ${{ vars.RAILWAY_SERVICE_ID }} --detach
      env: { RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }} }
```

Railway builds via the existing `nixpacks.toml` (repo root — it only builds `wash-and-go-backend/`).

### 4c. Frontend → Cloudflare Pages

```yaml
deploy-frontend:
  needs: deploy-backend
  runs-on: ubuntu-latest
  defaults: { run: { working-directory: wash-and-go-SE2 } }
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: { node-version: 24, cache: npm, cache-dependency-path: wash-and-go-SE2/package-lock.json }
    - run: npm ci
    - run: npm run build
      env:
        VITE_API_URL: ${{ vars.VITE_API_URL }}           # per-environment
        VITE_SUPABASE_URL: ${{ vars.VITE_SUPABASE_URL }}
        VITE_SUPABASE_ANON_KEY: ${{ vars.VITE_SUPABASE_ANON_KEY }}
    - run: npx wrangler pages deploy dist --project-name ${{ vars.CF_PAGES_PROJECT }}
      env:
        CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
        CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

⚠️ `VITE_*` values are **baked into the bundle at build time** — the build must happen inside
this job with the right env's values, not be reused across environments.

### 4d. Smoke test + rollback

```yaml
smoke-test:
  needs: deploy-frontend
  runs-on: ubuntu-latest
  steps:
    - name: API health
      run: curl -sf --retry 5 --retry-delay 10 "${{ vars.API_URL }}/api/health"
    - name: API serves data
      run: curl -sf "${{ vars.API_URL }}/api/services" | grep -q '\['
    - name: Frontend up
      run: curl -sf -o /dev/null "${{ vars.FRONTEND_URL }}"
```

On failure: Railway → redeploy previous deployment (dashboard or `railway redeploy`);
Cloudflare Pages → promote the previous deployment (dashboard, one click). Automate later
if desired; manual rollback documented here is acceptable for v1.

## 5. Secrets & Variables Checklist (per environment)

| Name | Type | staging | production |
|---|---|---|---|
| `RAILWAY_TOKEN` | secret | staging svc token | prod svc token |
| `RAILWAY_SERVICE_ID` | variable | staging service | prod service |
| `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` | secret | shared | shared |
| `CF_PAGES_PROJECT` | variable | staging project | `wash-and-go-front-back` |
| `SUPABASE_ACCESS_TOKEN` / `SUPABASE_DB_PASSWORD` | secret | test project | live project |
| `SUPABASE_PROJECT_REF` | variable | test project ref | `kgpwahbpjrnwswwevmlt` |
| `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | variable | staging values | prod values |
| `API_URL`, `FRONTEND_URL` | variable | staging URLs | prod URLs |

Backend runtime env vars (`SUPABASE_SERVICE_ROLE_KEY`, `BREVO_API_KEY`, `CORS_ORIGINS`, …)
stay configured **in Railway per service**, not in GitHub — the pipeline never needs them.

## 6. Implementation Order (suggested)

1. Create the staging Supabase project + Railway staging service + CF Pages staging project.
2. Create GitHub Environments (`staging`, `production` + required reviewer on production) and fill the table above.
3. Implement `test`-branch → staging flow end to end (migrate → backend → frontend → smoke).
4. Only after staging is proven, copy the flow for `main` → production and disconnect the platforms' built-in git auto-deploys.
5. Move SQL scripts into `supabase/migrations/` and relax the `*.sql` gitignore rule.
6. Optional later: run Playwright E2E against staging after each staging deploy; automated rollback.
