-- DropForeignKey
ALTER TABLE "stores" DROP CONSTRAINT "stores_city_id_fkey";

-- AlterTable
ALTER TABLE "stores" ALTER COLUMN "city_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "stores" ADD CONSTRAINT "stores_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
