-- AlterTable
ALTER TABLE "leases" ADD COLUMN     "payment_collection_day" INTEGER,
ADD COLUMN     "use_default_payment_day" BOOLEAN NOT NULL DEFAULT true;
