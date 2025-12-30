-- CreateEnum
CREATE TYPE "ManagerRole" AS ENUM ('tenant_manager', 'payment_manager', 'maintenance_manager', 'reports_viewer');

-- AlterTable
ALTER TABLE "managers" ADD COLUMN     "roles" "ManagerRole"[];
