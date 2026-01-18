-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('public', 'custom');

-- AlterTable
ALTER TABLE "subscription_plans" ADD COLUMN     "type" "PlanType" NOT NULL DEFAULT 'public';
