-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "discovery_source" TEXT DEFAULT 'google_maps',
ADD COLUMN     "external_id" TEXT,
ADD COLUMN     "last_discovered_at" TIMESTAMP(3),
ADD COLUMN     "opening_hours" JSONB,
ADD COLUMN     "services" JSONB;
