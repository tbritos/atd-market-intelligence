/*
  Warnings:

  - You are about to drop the column `desktop_score` on the `performance_metrics` table. All the data in the column will be lost.
  - You are about to drop the column `desktop_score` on the `seo_metrics` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "performance_metrics" DROP COLUMN "desktop_score";

-- AlterTable
ALTER TABLE "seo_metrics" DROP COLUMN "desktop_score";
