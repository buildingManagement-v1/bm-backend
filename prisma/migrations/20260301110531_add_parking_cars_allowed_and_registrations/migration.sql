-- AlterTable
ALTER TABLE "leases" ADD COLUMN     "cars_allowed" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "parking_registrations" (
    "id" TEXT NOT NULL,
    "building_id" TEXT NOT NULL,
    "lease_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "license_plate" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parking_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "parking_registrations_building_id_idx" ON "parking_registrations"("building_id");

-- CreateIndex
CREATE INDEX "parking_registrations_tenant_id_idx" ON "parking_registrations"("tenant_id");

-- CreateIndex
CREATE INDEX "parking_registrations_unit_id_idx" ON "parking_registrations"("unit_id");

-- CreateIndex
CREATE INDEX "parking_registrations_license_plate_idx" ON "parking_registrations"("license_plate");

-- CreateIndex
CREATE UNIQUE INDEX "parking_registrations_lease_id_license_plate_key" ON "parking_registrations"("lease_id", "license_plate");

-- AddForeignKey
ALTER TABLE "parking_registrations" ADD CONSTRAINT "parking_registrations_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_registrations" ADD CONSTRAINT "parking_registrations_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "leases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_registrations" ADD CONSTRAINT "parking_registrations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_registrations" ADD CONSTRAINT "parking_registrations_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
