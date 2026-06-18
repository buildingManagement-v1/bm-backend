# Deployment Guide — `bm-backend`

> Audience: DevOps. How the backend is built, shipped, and deployed.
> Repo: `github.com/ZackNew/bm-backend` (standalone — this repo *is* the backend).
> Target: a single **VPS** running Docker, image hosted on **GHCR**, deployed by
> **GitHub Actions** on every push to `main`.

Pipeline at a glance:

```
push to main ──► GitHub Actions
                   ├─ build Docker image  (Dockerfile)
                   ├─ push to ghcr.io/zacknew/bm-backend:latest + :<sha>
                   └─ ssh VPS ──► docker compose pull && up -d
                                    └─ app migrates on boot, then serves :8000
```

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
| Registry | `ghcr.io/zacknew/bm-backend` |

Build, migrations, and boot were verified locally against a throwaway Postgres
(see §7 for the commands).

---

## 2. Files in this repo

| File | Purpose |
|---|---|
| [`Dockerfile`](Dockerfile) | Multi-stage production image |
| [`docker-entrypoint.sh`](docker-entrypoint.sh) | Runs `migrate deploy` when `RUN_MIGRATIONS=true`, then starts the app |
| [`.dockerignore`](.dockerignore) | Keeps `node_modules`, secrets, `uploads` out of the build |
| [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) | CI/CD: build → push → deploy |
| [`docker-compose.prod.yml`](docker-compose.prod.yml) | The stack that runs **on the VPS** (app + Postgres) |
| [`.env.production.example`](.env.production.example) | Template for the VPS `.env` (real secrets) |

---

## 3. GitHub configuration (you have admin)

**Settings → Secrets and variables → Actions → Secrets.** Only the SSH access
to the VPS is needed — the app's runtime secrets live in the VPS `.env`, not here.

| Secret | What it is |
|---|---|
| `VPS_HOST` | VPS IP or hostname |
| `VPS_USER` | SSH user the deploy connects as (e.g. `deploy`) |
| `VPS_SSH_KEY` | **Private** key whose public half is in the VPS user's `~/.ssh/authorized_keys` |
| `VPS_PORT` | *(optional)* SSH port if not 22 |

GHCR push/pull uses the workflow's built-in `GITHUB_TOKEN` — no extra secret.
(The deploy job logs the VPS in to GHCR with that short-lived token each run.)

> If GHCR pull from the VPS ever fails on auth, the fallback is a read-only PAT
> (`read:packages`) stored once on the VPS via `docker login ghcr.io`.

---

## 4. VPS setup (one time)

On the server, as a sudo-capable user:

```bash
# 1. Install Docker Engine + compose plugin (skip if already present)
curl -fsSL https://get.docker.com | sh

# 2. Create the deploy directory
sudo mkdir -p /opt/bm-backend && sudo chown "$USER" /opt/bm-backend
cd /opt/bm-backend

# 3. Put the compose file here (copy docker-compose.prod.yml from the repo,
#    renamed to docker-compose.yml) and the secrets file:
#    - /opt/bm-backend/docker-compose.yml   (from docker-compose.prod.yml)
#    - /opt/bm-backend/.env                 (from .env.production.example, filled in)

# 4. First image pull needs GHCR auth (one-time login, or rely on the Action):
#    echo <GHCR_PAT_or_token> | docker login ghcr.io -u <github-user> --password-stdin

# 5. Bring it up
docker compose up -d
```

The deploy user must be in the `docker` group (`sudo usermod -aG docker $USER`)
so the GitHub Action can run `docker` without sudo.

---

## 5. Database migrations

Prisma migrations live in `prisma/migrations`. On this single-node VPS the app
applies them **on boot** — the compose file sets `RUN_MIGRATIONS=true`, and the
entrypoint runs `prisma migrate deploy` before starting the server.

`migrate deploy` only applies already-committed migrations; it never resets.
If you later scale to multiple replicas, drop `RUN_MIGRATIONS` from the app
service and run migrations as a separate one-off step instead (to avoid races):

```bash
docker compose run --rm -e RUN_MIGRATIONS=true app true
```

---

## 6. Things to address (not blockers for first deploy)

- **Uploads ⚠️** — payment receipts write to `/app/uploads`, persisted via the
  `bm_uploads` Docker volume. That survives redeploys on this node, but not a
  server move and not multiple nodes. Proper fix is object storage (S3/GCS) —
  an app-code change.
- **CORS** — now reads the allowlist from `CORS_ORIGINS` (comma-separated) or
  `FRONTEND_URL` in [`src/main.ts`](src/main.ts). Set `CORS_ORIGINS` in the VPS
  `.env` to your Vercel frontend origin once it's deployed, then
  `docker compose up -d` to reload.
- **Health check** — no dedicated endpoint; `GET /api` (Swagger) returns 200 and
  works as a probe for now.

---

## 7. Local verification (what was tested)

```bash
docker build -t bm-backend:local .

docker run --rm -e DATABASE_URL="postgres://user:pass@host:5432/db" \
  -e RUN_MIGRATIONS=true bm-backend:local true        # migrations apply

docker run -d --name bm-api -p 8000:8000 \
  -e DATABASE_URL="postgres://user:pass@host:5432/db" \
  -e JWT_SECRET=... -e JWT_REFRESH_SECRET=... \
  -e RESEND_API_KEY=... -e FRONTEND_URL=https://your-frontend \
  -v bm_uploads:/app/uploads bm-backend:local

curl -o /dev/null -w '%{http_code}\n' localhost:8000/api               # 200
curl -o /dev/null -w '%{http_code}\n' localhost:8000/v1/app/buildings  # 401
```

---

## 8. Rollback

Images are tagged with the git SHA. To roll back, on the VPS:

```bash
cd /opt/bm-backend
# pin the previous good SHA in docker-compose.yml (image: ...:<sha>) then:
docker compose up -d
```
