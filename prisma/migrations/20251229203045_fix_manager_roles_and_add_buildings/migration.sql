/*
  Warnings:

  - You are about to drop the column `roles` on the `managers` table. All the data in the column will be lost.

*/
-- AlterEnum
ALTER TYPE "ManagerRole" ADD VALUE 'operations_manager';

-- AlterTable
ALTER TABLE "managers" DROP COLUMN "roles";

-- CreateTable
CREATE TABLE "buildings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "logo_url" TEXT,
    "settings" JSONB,
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "buildings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manager_building_roles" (
    "id" TEXT NOT NULL,
    "manager_id" TEXT NOT NULL,
    "building_id" TEXT NOT NULL,
    "roles" "ManagerRole"[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manager_building_roles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "manager_building_roles_manager_id_idx" ON "manager_building_roles"("manager_id");

-- CreateIndex
CREATE INDEX "manager_building_roles_building_id_idx" ON "manager_building_roles"("building_id");

-- CreateIndex
CREATE UNIQUE INDEX "manager_building_roles_manager_id_building_id_key" ON "manager_building_roles"("manager_id", "building_id");

-- AddForeignKey
ALTER TABLE "manager_building_roles" ADD CONSTRAINT "manager_building_roles_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "managers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manager_building_roles" ADD CONSTRAINT "manager_building_roles_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
