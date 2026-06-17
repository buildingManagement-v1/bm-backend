# Deployment Guide — `bm-backend`

> Audience: DevOps. This documents what the backend needs to deploy, the
> credentials to configure in GitHub, and a reference GitHub Actions workflow.
> Decisions that are yours to make are marked **DECISION**.

This covers **`bm-backend/`** (the NestJS REST API) only. The two frontends
(`user-frontend/`, `platform-admin/`) are not covered yet.

---

## 1. What gets deployed

A single Docker image built from [`Dockerfile`](Dockerfile).

| Property | Value |
|---|---|
| Base | `node:24-alpine` |
| Runs as | non-root user `node` (uid 1000) |
| Listens on | `8000` (override with `PORT`) |
| Image size | ~697 MB |
| Entry | `node dist/src/main` (handled by the image) |
| Migrations | Prisma — see §4 |

The build, migrations, and boot have all been verified locally against a
throwaway Postgres (see §8 for the exact commands).

---

## 2. Prerequisites

- The image build requires `package-lock.json` to be **in sync** with
  `package.json`. It is, as of now. If `npm ci` ever fails in CI with
  "can only install packages when your package.json and package-lock.json are in
  sync", run `npm install --package-lock-only` in `bm-backend/` and commit the lockfile.
- A reachable **PostgreSQL** instance (the app uses the `pg` driver adapter).
- **DECISION — image registry:** the reference workflow pushes to **GitHub
  Container Registry (GHCR)** because it needs no extra credentials (it uses the
  built-in `GITHUB_TOKEN`). If you prefer Docker Hub / ECR / GAR, swap the login
  + tags and add the corresponding secrets (see §3).
- **DECISION — deploy target:** where the image runs (VPS via SSH, ECS, Kubernetes,
  Fly, Render, …) is not decided. The reference workflow builds and pushes the
  image; the final "deploy" step is a stub for you to fill per target.

---

## 3. Credentials to configure in GitHub

Set these under **Settings → Secrets and variables → Actions**.

### 3a. Repository **secrets** (sensitive — encrypted)

These are the app's runtime secrets. They are injected into the running
container by your deploy target (not baked into the image).

| Secret | What it is | Example / source |
|---|---|---|
| `DATABASE_URL` | Postgres connection string | `postgresql://user:pass@host:5432/bms_db?schema=public` |
| `JWT_SECRET` | Access-token signing key | long random string |
| `JWT_REFRESH_SECRET` | Refresh-token signing key | long random string (different from above) |
| `RESEND_API_KEY` | Email sending (Resend) | `re_...` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Push notifications (optional) | the **full** service-account JSON, single line. Leave unset to disable push. |

> The Firebase service account must **not** be committed. `bm-firebase-push.json`
> is git-ignored and excluded from the image; use the env var in production.

If you choose a non-GHCR registry, also add its login secrets, e.g.
`DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN`, or cloud credentials for ECR/GAR.
For the deploy step, add whatever your target needs (e.g. `SSH_HOST` +
`SSH_KEY`, or `KUBE_CONFIG`).

### 3b. Repository **variables** (non-sensitive config)

| Variable | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | already defaulted in the image, but explicit is fine |
| `PORT` | `8000` | only if you want a different port |
| `FRONTEND_URL` | `https://your-frontend-domain` | used by emails / links — and see §6 |

---

## 4. Database migrations

Prisma migrations live in `prisma/migrations`. They are **not** applied
automatically on app boot (so multiple replicas don't race each other).

Two supported ways to apply them:

**A. One-off job (recommended for >1 replica).** Run the same image with
`RUN_MIGRATIONS=true` and a no-op command, before rolling out the new app:

```bash
docker run --rm \
  -e DATABASE_URL="$DATABASE_URL" \
  -e RUN_MIGRATIONS=true \
  <image> true
```

The entrypoint runs `prisma migrate deploy` and exits.

**B. Single-instance deploys.** Set `RUN_MIGRATIONS=true` on the app container
itself; the entrypoint migrates, then starts the server. Do **not** use this
with multiple replicas.

`migrate deploy` only applies already-committed migrations — it never generates
or resets. The Prisma CLI + schema engine are included in the image for this.

---

## 5. Persistent storage — uploads ⚠️ **DECISION**

Payment receipts are written to `/app/uploads` on local disk. A container
filesystem is **ephemeral** — these files are lost on every redeploy/restart,
and are not shared across replicas.

Options:
- **Short term:** mount a persistent volume at `/app/uploads`
  (`-v bm_uploads:/app/uploads`, or a `PersistentVolumeClaim` in k8s). Works only
  for a single node.
- **Proper fix:** move uploads to object storage (S3/GCS). This is an
  application-code change, not a deploy change — flag it to the backend team.

---

## 6. CORS ⚠️ needs a code change before prod

CORS is currently hardcoded to `http://localhost:3000` / `:3001` in
[`src/main.ts`](src/main.ts). The deployed frontend will be **blocked** until
this reads the allowed origin from `FRONTEND_URL` (or an allowlist). Flag to the
backend team; it's a one-line fix but it is a hard blocker for a working prod
frontend.

---

## 7. Health check

There is no dedicated health endpoint yet. `GET /api` (Swagger UI) returns
`200` and can serve as a liveness/readiness probe for now. Consider adding a
lightweight `GET /health` to the backend later.

---

## 8. Local verification (what was tested)

```bash
cd bm-backend

# Build
docker build -t bm-backend:local .

# Apply migrations against your DB
docker run --rm -e DATABASE_URL="postgres://user:pass@host:5432/db" \
  -e RUN_MIGRATIONS=true bm-backend:local true

# Run
docker run -d --name bm-api -p 8000:8000 \
  -e DATABASE_URL="postgres://user:pass@host:5432/db" \
  -e JWT_SECRET=... -e JWT_REFRESH_SECRET=... \
  -e RESEND_API_KEY=... -e FRONTEND_URL=https://your-frontend \
  -v bm_uploads:/app/uploads \
  bm-backend:local

# Verify
curl -o /dev/null -w '%{http_code}\n' localhost:8000/api            # 200
curl -o /dev/null -w '%{http_code}\n' localhost:8000/v1/app/buildings  # 401 (guards live)
```

---

## 9. Reference GitHub Actions workflow

Save as `.github/workflows/deploy-backend.yml` **at the repo root** (Actions
workflows must live there, even though this app is in `bm-backend/`). This
builds and pushes to GHCR on pushes to `main` that touch `bm-backend/`. The
final deploy step is a **stub** — fill it in for your target (§2).

```yaml
name: Deploy backend

on:
  push:
    branches: [main]
    paths:
      - 'bm-backend/**'
      - '.github/workflows/deploy-backend.yml'
  workflow_dispatch: {}

env:
  IMAGE: ghcr.io/${{ github.repository }}/bm-backend

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write          # required to push to GHCR
    steps:
      - uses: actions/checkout@v4

      - uses: docker/setup-buildx-action@v3

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}   # built-in, no setup needed

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: ./bm-backend
          push: true
          tags: |
            ${{ env.IMAGE }}:latest
            ${{ env.IMAGE }}:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # ---------------------------------------------------------------------------
  # DECISION: implement for your target. Two things must happen, in order:
  #   1. run migrations:  docker run --rm -e DATABASE_URL -e RUN_MIGRATIONS=true <image> true
  #   2. roll out the new image and inject the §3a runtime secrets
  #
  # Example shape (SSH to a host) — adapt freely:
  #
  # deploy:
  #   needs: build-and-push
  #   runs-on: ubuntu-latest
  #   steps:
  #     - name: Deploy over SSH
  #       uses: appleboy/ssh-action@v1
  #       with:
  #         host: ${{ secrets.SSH_HOST }}
  #         username: ${{ secrets.SSH_USER }}
  #         key: ${{ secrets.SSH_KEY }}
  #         script: |
  #           docker pull ghcr.io/${{ github.repository }}/bm-backend:latest
  #           docker run --rm -e DATABASE_URL='${{ secrets.DATABASE_URL }}' \
  #             -e RUN_MIGRATIONS=true ghcr.io/${{ github.repository }}/bm-backend:latest true
  #           docker compose up -d   # or systemd / k8s apply / etc.
  # ---------------------------------------------------------------------------
```

> Note: GHCR images default to private. After the first push, make the package
> visible to the deploy host (package settings) or have the host log in to GHCR
> with a token.

---

## 10. Open decisions (DevOps to confirm)

- [ ] Image registry — GHCR (default) vs Docker Hub / ECR / GAR.
- [ ] Deploy target — VPS / ECS / k8s / Fly / Render → drives the `deploy` job.
- [ ] Where Postgres is hosted and how `DATABASE_URL` is provided.
- [ ] Uploads strategy (§5) — volume now, object storage later.
- [ ] Frontend deployment (separate from this doc).
