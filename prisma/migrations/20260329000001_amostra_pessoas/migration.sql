CREATE TABLE "amostra_lead_pessoas" (
    "id"           TEXT         NOT NULL,
    "lead_id"      TEXT         NOT NULL,
    "nome"         TEXT         NOT NULL,
    "email"        TEXT,
    "cargo"        TEXT,
    "linkedin"     TEXT,
    "telefone"     TEXT,
    "is_principal" BOOLEAN      NOT NULL DEFAULT false,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "amostra_lead_pessoas_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "amostra_lead_pessoas_lead_id_idx" ON "amostra_lead_pessoas"("lead_id");

ALTER TABLE "amostra_lead_pessoas"
  ADD CONSTRAINT "amostra_lead_pessoas_lead_id_fkey"
  FOREIGN KEY ("lead_id") REFERENCES "amostra_leads"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
