/*
  Warnings:

  - You are about to drop the column `new_building_count` on the `subscription_history` table. All the data in the column will be lost.
  - You are about to drop the column `new_manager_count` on the `subscription_history` table. All the data in the column will be lost.
  - You are about to drop the column `old_building_count` on the `subscription_history` table. All the data in the column will be lost.
  - You are about to drop the column `old_manager_count` on the `subscription_history` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "subscription_history" DROP COLUMN "new_building_count",
DROP COLUMN "new_manager_count",
DROP COLUMN "old_building_count",
DROP COLUMN "old_manager_count";
