-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'cancelled', 'expired');

-- CreateEnum
CREATE TYPE "SubscriptionAction" AS ENUM ('created', 'upgraded', 'downgraded', 'renewed', 'cancelled');

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "building_count" INTEGER NOT NULL,
    "manager_count" INTEGER NOT NULL,
    "total_amount" DECIMAL(65,30) NOT NULL,
    "billing_cycle_start" TIMESTAMP(3) NOT NULL,
    "billing_cycle_end" TIMESTAMP(3) NOT NULL,
    "next_billing_date" TIMESTAMP(3) NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_history" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "action" "SubscriptionAction" NOT NULL,
    "old_plan_id" TEXT,
    "new_plan_id" TEXT NOT NULL,
    "old_building_count" INTEGER,
    "new_building_count" INTEGER NOT NULL,
    "old_manager_count" INTEGER,
    "new_manager_count" INTEGER NOT NULL,
    "prorated_amount" DECIMAL(65,30),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "subscriptions_plan_id_idx" ON "subscriptions"("plan_id");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE INDEX "subscription_history_user_id_idx" ON "subscription_history"("user_id");

-- CreateIndex
CREATE INDEX "subscription_history_subscription_id_idx" ON "subscription_history"("subscription_id");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_history" ADD CONSTRAINT "subscription_history_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_history" ADD CONSTRAINT "subscription_history_old_plan_id_fkey" FOREIGN KEY ("old_plan_id") REFERENCES "subscription_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_history" ADD CONSTRAINT "subscription_history_new_plan_id_fkey" FOREIGN KEY ("new_plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
