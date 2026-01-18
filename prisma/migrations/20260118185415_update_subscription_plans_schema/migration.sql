/*
  Warnings:

  - You are about to drop the column `building_price` on the `subscription_plans` table. All the data in the column will be lost.
  - You are about to drop the column `manager_price` on the `subscription_plans` table. All the data in the column will be lost.
  - You are about to drop the column `building_count` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `manager_count` on the `subscriptions` table. All the data in the column will be lost.
  - Added the required column `price` to the `subscription_plans` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "subscription_plans" DROP COLUMN "building_price",
DROP COLUMN "manager_price",
ADD COLUMN     "price" DECIMAL(65,30) NOT NULL;

-- AlterTable
ALTER TABLE "subscriptions" DROP COLUMN "building_count",
DROP COLUMN "manager_count";
