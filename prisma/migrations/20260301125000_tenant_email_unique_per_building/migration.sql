-- DropIndex
DROP INDEX "tenants_email_key";

-- CreateIndex
CREATE UNIQUE INDEX "tenants_building_id_email_key" ON "tenants"("building_id", "email");
