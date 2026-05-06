-- AlterTable
ALTER TABLE "brands" ADD COLUMN     "active_websites" INTEGER DEFAULT 0,
ADD COLUMN     "avg_performance_score" DOUBLE PRECISION,
ADD COLUMN     "avg_response_time" INTEGER,
ADD COLUMN     "avg_seo_score" DOUBLE PRECISION,
ADD COLUMN     "metrics_updated_at" TIMESTAMP(3),
ADD COLUMN     "total_websites" INTEGER DEFAULT 0;
