-- AlterTable
ALTER TABLE "payment_periods" ADD COLUMN     "days_in_cycle" INTEGER,
ADD COLUMN     "period_end" TIMESTAMP(3),
ADD COLUMN     "period_start" TIMESTAMP(3);
