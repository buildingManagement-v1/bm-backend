#!/bin/sh
set -e

# Optionally apply pending DB migrations before the app starts.
# Enable for single-instance deploys by setting RUN_MIGRATIONS=true.
# For multi-replica deploys, leave this off and run migrations as a
# separate one-off job instead (avoids replicas racing each other):
#   docker run --rm -e DATABASE_URL=... -e RUN_MIGRATIONS=true <image> true
if [ "$RUN_MIGRATIONS" = "true" ]; then
  echo "[entrypoint] Applying database migrations (prisma migrate deploy)..."
  node node_modules/prisma/build/index.js migrate deploy
fi

exec "$@"
