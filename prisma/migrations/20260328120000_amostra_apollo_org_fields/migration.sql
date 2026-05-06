-- AlterTable: adicionar campos Apollo Organization Enrichment ao AmostraLead
ALTER TABLE "amostra_leads"
  ADD COLUMN "apollo_org_id"         TEXT,
  ADD COLUMN "telefone_apollo"        TEXT,
  ADD COLUMN "linkedin_empresa"       TEXT,
  ADD COLUMN "descricao_apollo"       TEXT,
  ADD COLUMN "cidade_apollo"          TEXT,
  ADD COLUMN "estado_apollo"          TEXT,
  ADD COLUMN "fundado_em_apollo"      INTEGER,
  ADD COLUMN "keywords_apollo"        TEXT,
  ADD COLUMN "departamentos_apollo"   TEXT;
