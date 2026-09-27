-- CreateEnum
CREATE TYPE "AnnouncementPriority" AS ENUM ('normal', 'important', 'urgent');

-- CreateEnum
CREATE TYPE "SubscriptionRequestStatus" AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "AdvertAudience" AS ENUM ('all', 'owner', 'manager', 'tenant');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityEntityType" ADD VALUE 'building';
ALTER TYPE "ActivityEntityType" ADD VALUE 'announcement';
ALTER TYPE "ActivityEntityType" ADD VALUE 'subscription';
ALTER TYPE "ActivityEntityType" ADD VALUE 'subscription_request';
ALTER TYPE "ActivityEntityType" ADD VALUE 'login_advert';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'subscription_request_created';
ALTER TYPE "NotificationType" ADD VALUE 'subscription_request_updated';
ALTER TYPE "NotificationType" ADD VALUE 'lease_terminated';
ALTER TYPE "NotificationType" ADD VALUE 'rent_due';
ALTER TYPE "NotificationType" ADD VALUE 'rent_overdue';
ALTER TYPE "NotificationType" ADD VALUE 'announcement';

-- DropIndex
DROP INDEX "invoices_invoice_number_key";

-- AlterTable
ALTER TABLE "announcements" ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "created_by_name" TEXT,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by_id" TEXT,
ADD COLUMN     "expires_at" TIMESTAMP(3);

-- Keep existing priorities: cast in place instead of drop/recreate
UPDATE "announcements" SET "priority" = 'normal' WHERE "priority" IS NULL OR "priority" NOT IN ('normal', 'important', 'urgent');
ALTER TABLE "announcements" ALTER COLUMN "priority" TYPE "AnnouncementPriority" USING "priority"::"AnnouncementPriority";
ALTER TABLE "announcements" ALTER COLUMN "priority" SET DEFAULT 'normal';
ALTER TABLE "announcements" ALTER COLUMN "priority" SET NOT NULL;

-- AlterTable
ALTER TABLE "buildings" ADD COLUMN     "payment_grace_days" INTEGER NOT NULL DEFAULT 5;

-- AlterTable
ALTER TABLE "leases" ADD COLUMN     "expiry_notice_sent_at" TIMESTAMP(3),
ADD COLUMN     "terminated_at" TIMESTAMP(3),
ADD COLUMN     "termination_reason" TEXT;

-- AlterTable
ALTER TABLE "maintenance_requests" ALTER COLUMN "tenant_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "otps" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "payment_periods" ADD COLUMN     "reminder_sent_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "expiry_reminder_sent_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "subscription_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "receipt_url" TEXT NOT NULL,
    "payment_reference" TEXT,
    "notes" TEXT,
    "status" "SubscriptionRequestStatus" NOT NULL DEFAULT 'pending',
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by_id" TEXT,
    "rejection_reason" TEXT,
    "subscription_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_adverts" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "image_url" TEXT NOT NULL,
    "link_url" TEXT,
    "audience" "AdvertAudience" NOT NULL DEFAULT 'all',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "login_adverts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subscription_requests_user_id_idx" ON "subscription_requests"("user_id");

-- CreateIndex
CREATE INDEX "subscription_requests_status_idx" ON "subscription_requests"("status");

-- CreateIndex
CREATE INDEX "login_adverts_is_active_idx" ON "login_adverts"("is_active");

-- CreateIndex
CREATE INDEX "announcements_published_at_idx" ON "announcements"("published_at");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_building_id_invoice_number_key" ON "invoices"("building_id", "invoice_number");

-- AddForeignKey
ALTER TABLE "subscription_requests" ADD CONSTRAINT "subscription_requests_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

