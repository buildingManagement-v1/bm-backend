-- Emails are now trimmed + lower-cased on input. Bring existing rows in line,
-- skipping any row whose normalized email would clash with another live row
-- in the same uniqueness scope (those need a manual merge).

UPDATE "platform_admins" a SET "email" = lower(trim(a."email"))
WHERE a."email" <> lower(trim(a."email"))
  AND NOT EXISTS (
    SELECT 1 FROM "platform_admins" o
    WHERE o."id" <> a."id" AND lower(trim(o."email")) = lower(trim(a."email")));

UPDATE "users" u SET "email" = lower(trim(u."email"))
WHERE u."email" <> lower(trim(u."email"))
  AND NOT EXISTS (
    SELECT 1 FROM "users" o
    WHERE o."id" <> u."id" AND lower(trim(o."email")) = lower(trim(u."email")));

UPDATE "managers" m SET "email" = lower(trim(m."email"))
WHERE m."email" <> lower(trim(m."email"))
  AND NOT EXISTS (
    SELECT 1 FROM "managers" o
    WHERE o."id" <> m."id" AND o."deleted_at" IS NULL AND m."deleted_at" IS NULL
      AND lower(trim(o."email")) = lower(trim(m."email")));

UPDATE "tenants" t SET "email" = lower(trim(t."email"))
WHERE t."email" <> lower(trim(t."email"))
  AND NOT EXISTS (
    SELECT 1 FROM "tenants" o
    WHERE o."id" <> t."id" AND o."building_id" = t."building_id"
      AND o."deleted_at" IS NULL AND t."deleted_at" IS NULL
      AND lower(trim(o."email")) = lower(trim(t."email")));
