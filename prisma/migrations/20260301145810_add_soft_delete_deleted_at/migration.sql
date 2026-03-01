-- CreateIndex
CREATE INDEX "manager_building_roles_manager_id_building_id_idx" ON "manager_building_roles"("manager_id", "building_id");

-- CreateIndex
CREATE INDEX "managers_email_idx" ON "managers"("email");

-- CreateIndex
CREATE INDEX "parking_registrations_lease_id_license_plate_idx" ON "parking_registrations"("lease_id", "license_plate");

-- CreateIndex
CREATE INDEX "tenants_building_id_email_idx" ON "tenants"("building_id", "email");

-- CreateIndex
CREATE INDEX "units_building_id_unit_number_idx" ON "units"("building_id", "unit_number");
