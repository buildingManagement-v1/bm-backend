# Deployment — `bm-backend`

**Live:** https://bm-api.duckdns.org  ·  Swagger: `/api`  ·  API routes under `/v1`
**Repo:** `github.com/buildingManagement-v1/bm-backend` (this repo *is* the backend)
**Deploys:** automatically on every push to `main`.

---

## How a request flows

```
Browser / Vercel frontend
      │  HTTPS
      ▼
https://bm-api.duckdns.org          DuckDNS → 49.12.109.7
      │
  host nginx  (TLS cert via certbot, auto-renew)
      │  proxy_pass → 127.0.0.1:8000
      ▼
  bm-backend container ──► bm-postgres container     (docker compose, /opt/bm-backend)
      │
  uploads → bm_uploads docker volume
```

## How a deploy flows

```
git push main ─► GitHub Actions (.github/workflows/deploy.yml)
   1. build image from Dockerfile
   2. push ghcr.io/buildingmanagement-v1/bm-backend  (tags: latest + <git-sha>)
   3. ssh into VPS → docker compose pull && up -d
        └─ entrypoint runs `prisma migrate deploy`, then starts the server
```

No manual steps. Merge to `main` = deployed.

---

## Where everything lives

**In this repo**
| File | Purpose |
|---|---|
| `Dockerfile` | Multi-stage prod image (node:24-alpine, non-root, ~697 MB) |
| `docker-entrypoint.sh` | Runs migrations when `RUN_MIGRATIONS=true`, then starts app |
| `.github/workflows/deploy.yml` | The CI/CD pipeline above |
| `docker-compose.prod.yml` | Reference copy of the VPS stack |
| `.env.production.example` | Template for the VPS secrets file |

**On the VPS** (`49.12.109.7`, SSH user `zat`, key-based) under `/opt/bm-backend/`
| Item | Purpose |
|---|---|
| `docker-compose.yml` | The running stack (app + Postgres). **Managed by hand**, not by CI. |
| `.env` | Real secrets (DB, JWT, Resend, Firebase, CORS). **Never committed.** |
| `bm_uploads` volume | Uploaded receipts |
| `postgres_data` volume | Database data |

**GitHub** → Settings → Secrets → Actions: `VPS_HOST`, `VPS_USER`, `VPS_PORT`, `VPS_SSH_KEY` (deploy key). Image push/pull uses the built-in `GITHUB_TOKEN`.

**nginx** → `/etc/nginx/sites-available/bm-api.duckdns.org` (cert managed by certbot).

---

## Operating it

```bash
# Deploy            → just push/merge to main.

# Watch a deploy    → GitHub → Actions tab ("Deploy backend").

# Logs
ssh zat@49.12.109.7 -p 1447
docker logs -f bm-backend

# Change a secret / env value
cd /opt/bm-backend && nano .env
docker compose up -d --force-recreate --no-deps app   # ~10s blip while it reboots

# Roll back to a previous version
cd /opt/bm-backend
#   set image: ghcr.io/buildingmanagement-v1/bm-backend:<old-git-sha> in docker-compose.yml
docker compose up -d

# Run migrations manually (normally automatic on boot)
docker compose run --rm -e RUN_MIGRATIONS=true app true
```

---

## Must-know notes

- **⚠️ Shared server.** This VPS also runs unrelated projects (`arifget`, `eventality`)
  behind the **same** host nginx. Touch **only** `bm-api.duckdns.org` configs/certs —
  never their server blocks. nginx backups live at `/root/nginx-backup-*`. Always
  `sudo nginx -t` before any reload.
- **Migrations run on boot** (`RUN_MIGRATIONS=true`). Fine for one node. If you ever run
  multiple app replicas, drop that flag and run migrations as a separate one-off step.
- **CORS** is read from `CORS_ORIGINS` (comma-separated) in `.env`. Set it to the frontend
  origin(s); reload to apply. (Currently allows `localhost` for dev testing.)
- **Uploads** are on a local docker volume — survive redeploys, but not a server move or a
  second node. Move to object storage (S3/GCS) before scaling. App-code change.
- **Port 8000** is also directly reachable (`http://49.12.109.7:8000`) because Docker
  publishes it past ufw. Optional hardening: bind it to `127.0.0.1` so HTTPS is the only
  public entrypoint.
- **No dedicated health endpoint** yet; `GET /api` (200) works as a probe.
- **TLS** auto-renews via certbot's scheduled task; cert is per-domain (separate from arifget).
