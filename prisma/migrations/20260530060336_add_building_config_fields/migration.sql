-- AlterTable
ALTER TABLE "buildings" ADD COLUMN     "payment_collection_day" INTEGER,
ADD COLUMN     "total_parking_lots" INTEGER NOT NULL DEFAULT 0;
