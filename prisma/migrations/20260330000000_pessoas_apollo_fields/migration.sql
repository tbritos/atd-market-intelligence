ALTER TABLE "amostra_lead_pessoas"
  ADD COLUMN IF NOT EXISTS "apollo_pessoa_id" TEXT,
  ADD COLUMN IF NOT EXISTS "apollo_has_email" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "apollo_has_phone" BOOLEAN;
