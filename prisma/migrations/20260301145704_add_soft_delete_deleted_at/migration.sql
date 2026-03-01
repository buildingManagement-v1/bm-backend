-- DropIndex
DROP INDEX "manager_building_roles_manager_id_building_id_key";

-- DropIndex
DROP INDEX "managers_email_key";

-- DropIndex
DROP INDEX "parking_registrations_lease_id_license_plate_key";

-- DropIndex
DROP INDEX "tenants_building_id_email_key";

-- DropIndex
DROP INDEX "units_building_id_unit_number_key";

-- AlterTable
ALTER TABLE "buildings" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by_id" TEXT;

-- AlterTable
ALTER TABLE "leases" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by_id" TEXT;

-- AlterTable
ALTER TABLE "maintenance_requests" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by_id" TEXT;

-- AlterTable
ALTER TABLE "manager_building_roles" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by_id" TEXT;

-- AlterTable
ALTER TABLE "managers" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by_id" TEXT;

-- AlterTable
ALTER TABLE "parking_registrations" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by_id" TEXT;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by_id" TEXT;

-- AlterTable
ALTER TABLE "units" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by_id" TEXT;

-- Partial unique indexes: enforce uniqueness only for non-deleted rows
CREATE UNIQUE INDEX "manager_building_roles_manager_id_building_id_key" ON "manager_building_roles"("manager_id", "building_id") WHERE "deleted_at" IS NULL;

CREATE UNIQUE INDEX "managers_email_key" ON "managers"("email") WHERE "deleted_at" IS NULL;

CREATE UNIQUE INDEX "parking_registrations_lease_id_license_plate_key" ON "parking_registrations"("lease_id", "license_plate") WHERE "deleted_at" IS NULL;

CREATE UNIQUE INDEX "tenants_building_id_email_key" ON "tenants"("building_id", "email") WHERE "deleted_at" IS NULL;

CREATE UNIQUE INDEX "units_building_id_unit_number_key" ON "units"("building_id", "unit_number") WHERE "deleted_at" IS NULL;
