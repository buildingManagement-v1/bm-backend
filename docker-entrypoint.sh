#!/bin/sh
set -e
# Ensure Prisma sees DATABASE_URL from Docker Compose
export DATABASE_URL="${DATABASE_URL}"
echo "Waiting for Postgres and running migrations..."
for i in 1 2 3 4 5 6 7 8 9 10; do
  if npx prisma migrate deploy; then
    echo "Migrations complete."
    break
  fi
  echo "Attempt $i failed, retrying in 2s..."
  sleep 2
done
exec "$@"
