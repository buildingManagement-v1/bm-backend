/*
  Warnings:

  - You are about to drop the column `unit_id` on the `tenants` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "tenants" DROP CONSTRAINT "tenants_unit_id_fkey";

-- DropIndex
DROP INDEX "tenants_unit_id_idx";

-- AlterTable
ALTER TABLE "tenants" DROP COLUMN "unit_id",
ALTER COLUMN "status" SET DEFAULT 'inactive';
