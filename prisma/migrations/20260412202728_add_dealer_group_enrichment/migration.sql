-- CreateEnum
CREATE TYPE "DealerGroupQueue" AS ENUM ('BLOCKED_CRM', 'APOLLO_READY', 'HUNTER_FALLBACK', 'REVIEW');

-- CreateEnum
CREATE TYPE "DealerGroupConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "DealerGroupCrmStatus" AS ENUM ('NOT_FOUND', 'LEAD', 'DEAL_ATIVO', 'CLIENTE');

-- CreateEnum
CREATE TYPE "DealerGroupEnrichmentSource" AS ENUM ('PIPEDRIVE', 'APOLLO', 'HUNTER', 'WEBSITE', 'MANUAL');

-- CreateEnum
CREATE TYPE "DealerGroupRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "dealer_group_id" TEXT;

-- CreateTable
CREATE TABLE "dealer_groups" (
    "id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "website_url" TEXT,
    "provider_name" TEXT,
    "bucket" TEXT,
    "store_count" INTEGER NOT NULL DEFAULT 0,
    "stores_with_phone" INTEGER NOT NULL DEFAULT 0,
    "states" JSONB,
    "cities" JSONB,
    "crm_status" "DealerGroupCrmStatus" NOT NULL DEFAULT 'NOT_FOUND',
    "crm_org_id" INTEGER,
    "crm_org_name" TEXT,
    "crm_org_website" TEXT,
    "crm_city" TEXT,
    "crm_deal_id" INTEGER,
    "crm_deal_stage" TEXT,
    "crm_owner_name" TEXT,
    "crm_matched_term" TEXT,
    "last_pipedrive_check_at" TIMESTAMP(3),
    "queue" "DealerGroupQueue" NOT NULL DEFAULT 'REVIEW',
    "priority_score" INTEGER NOT NULL DEFAULT 0,
    "confidence" "DealerGroupConfidence" NOT NULL DEFAULT 'MEDIUM',
    "reasons" JSONB,
    "apollo_status" "DealerGroupRunStatus" NOT NULL DEFAULT 'PENDING',
    "apollo_mode" TEXT,
    "apollo_org_id" TEXT,
    "apollo_org_name" TEXT,
    "apollo_domain" TEXT,
    "apollo_phone" TEXT,
    "apollo_linkedin_url" TEXT,
    "apollo_city" TEXT,
    "apollo_state" TEXT,
    "apollo_employee_count" INTEGER,
    "apollo_keywords" JSONB,
    "apollo_technologies" JSONB,
    "apollo_org_query_terms" JSONB,
    "apollo_people_query_terms" JSONB,
    "apollo_title_hints" JSONB,
    "last_apollo_check_at" TIMESTAMP(3),
    "hunter_status" "DealerGroupRunStatus" NOT NULL DEFAULT 'PENDING',
    "hunter_mode" TEXT,
    "hunter_domain" TEXT,
    "hunter_email_pattern" TEXT,
    "hunter_finder_candidates" JSONB,
    "last_hunter_check_at" TIMESTAMP(3),
    "last_error_source" "DealerGroupEnrichmentSource",
    "last_error_message" TEXT,
    "ready_for_sdr" BOOLEAN NOT NULL DEFAULT false,
    "export_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dealer_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dealer_group_contacts" (
    "id" TEXT NOT NULL,
    "dealer_group_id" TEXT NOT NULL,
    "store_id" TEXT,
    "source" "DealerGroupEnrichmentSource" NOT NULL,
    "external_id" TEXT,
    "full_name" TEXT,
    "first_name" TEXT,
    "last_name" TEXT,
    "title" TEXT,
    "seniority" TEXT,
    "department" TEXT,
    "email" TEXT,
    "email_status" TEXT,
    "email_confidence" INTEGER,
    "phone" TEXT,
    "linkedin_url" TEXT,
    "city" TEXT,
    "state" TEXT,
    "is_decision_maker" BOOLEAN NOT NULL DEFAULT false,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "raw_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dealer_group_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dealer_group_runs" (
    "id" TEXT NOT NULL,
    "dealer_group_id" TEXT NOT NULL,
    "source" "DealerGroupEnrichmentSource" NOT NULL,
    "status" "DealerGroupRunStatus" NOT NULL DEFAULT 'PENDING',
    "credits_used" INTEGER,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "request_payload" JSONB,
    "response_payload" JSONB,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dealer_group_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dealer_groups_brand_id_queue_priority_score_idx" ON "dealer_groups"("brand_id", "queue", "priority_score");

-- CreateIndex
CREATE INDEX "dealer_groups_crm_status_ready_for_sdr_idx" ON "dealer_groups"("crm_status", "ready_for_sdr");

-- CreateIndex
CREATE UNIQUE INDEX "dealer_groups_brand_id_domain_key" ON "dealer_groups"("brand_id", "domain");

-- CreateIndex
CREATE INDEX "dealer_group_contacts_dealer_group_id_source_idx" ON "dealer_group_contacts"("dealer_group_id", "source");

-- CreateIndex
CREATE INDEX "dealer_group_contacts_email_idx" ON "dealer_group_contacts"("email");

-- CreateIndex
CREATE UNIQUE INDEX "dealer_group_contacts_dealer_group_id_source_external_id_key" ON "dealer_group_contacts"("dealer_group_id", "source", "external_id");

-- CreateIndex
CREATE INDEX "dealer_group_runs_dealer_group_id_source_requested_at_idx" ON "dealer_group_runs"("dealer_group_id", "source", "requested_at");

-- CreateIndex
CREATE INDEX "dealer_group_runs_source_status_idx" ON "dealer_group_runs"("source", "status");

-- CreateIndex
CREATE INDEX "stores_dealer_group_id_idx" ON "stores"("dealer_group_id");

-- AddForeignKey
ALTER TABLE "stores" ADD CONSTRAINT "stores_dealer_group_id_fkey" FOREIGN KEY ("dealer_group_id") REFERENCES "dealer_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_groups" ADD CONSTRAINT "dealer_groups_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_group_contacts" ADD CONSTRAINT "dealer_group_contacts_dealer_group_id_fkey" FOREIGN KEY ("dealer_group_id") REFERENCES "dealer_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_group_contacts" ADD CONSTRAINT "dealer_group_contacts_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_group_runs" ADD CONSTRAINT "dealer_group_runs_dealer_group_id_fkey" FOREIGN KEY ("dealer_group_id") REFERENCES "dealer_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
