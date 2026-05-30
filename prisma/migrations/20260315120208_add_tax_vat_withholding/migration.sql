-- AlterTable: add VAT and withholding rate fields to buildings
ALTER TABLE "buildings" ADD COLUMN "vat_rate" DECIMAL(65,30);
ALTER TABLE "buildings" ADD COLUMN "withholding_rate" DECIMAL(65,30);

-- AlterTable: add VAT/withholding flags to leases
ALTER TABLE "leases" ADD COLUMN "apply_vat" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "leases" ADD COLUMN "apply_withholding" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: add tax breakdown columns to payments
ALTER TABLE "payments" ADD COLUMN "base_amount" DECIMAL(65,30);
ALTER TABLE "payments" ADD COLUMN "vat_amount" DECIMAL(65,30);
ALTER TABLE "payments" ADD COLUMN "withholding_amount" DECIMAL(65,30);

-- AlterTable: add TIN field to tenants
ALTER TABLE "tenants" ADD COLUMN "tin" TEXT;
