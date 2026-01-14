-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('user_registration', 'manager_created', 'tenant_created', 'payment_received', 'invoice_created', 'invoice_overdue', 'maintenance_request_created', 'maintenance_request_updated', 'lease_created', 'lease_expiring', 'lease_expired', 'subscription_created', 'subscription_upgraded', 'subscription_expiring', 'subscription_expired');

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "user_type" "UserType" NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "link" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_user_id_user_type_idx" ON "notifications"("user_id", "user_type");

-- CreateIndex
CREATE INDEX "notifications_is_read_idx" ON "notifications"("is_read");

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at");
