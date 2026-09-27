-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityEntityType" ADD VALUE 'platform_admin';
ALTER TYPE "ActivityEntityType" ADD VALUE 'platform_setting';
ALTER TYPE "ActivityEntityType" ADD VALUE 'broadcast';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'platform_broadcast';

-- CreateTable
CREATE TABLE "platform_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_by_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key")
);

