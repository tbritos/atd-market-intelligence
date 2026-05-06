-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "capital_social" DOUBLE PRECISION,
ADD COLUMN     "cnae_code" TEXT,
ADD COLUMN     "cnae_descricao" TEXT,
ADD COLUMN     "cnpj" TEXT,
ADD COLUMN     "cnpj_enriched_at" TIMESTAMP(3),
ADD COLUMN     "contact_scraped_at" TIMESTAMP(3),
ADD COLUMN     "data_abertura" TIMESTAMP(3),
ADD COLUMN     "email" TEXT,
ADD COLUMN     "email_receita" TEXT,
ADD COLUMN     "endereco_bairro" TEXT,
ADD COLUMN     "endereco_cep" TEXT,
ADD COLUMN     "endereco_logradouro" TEXT,
ADD COLUMN     "endereco_numero" TEXT,
ADD COLUMN     "facebook" TEXT,
ADD COLUMN     "instagram" TEXT,
ADD COLUMN     "linkedin" TEXT,
ADD COLUMN     "nome_fantasia" TEXT,
ADD COLUMN     "porte" TEXT,
ADD COLUMN     "razao_social" TEXT,
ADD COLUMN     "situacao_cadastral" TEXT,
ADD COLUMN     "telefone_receita" TEXT,
ADD COLUMN     "whatsapp" TEXT,
ADD COLUMN     "youtube" TEXT;

-- CreateTable
CREATE TABLE "store_partners" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cpf_mascarado" TEXT,
    "qualificacao" TEXT,
    "email" TEXT,
    "linkedin_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_partners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "store_partners_store_id_nome_key" ON "store_partners"("store_id", "nome");

-- AddForeignKey
ALTER TABLE "store_partners" ADD CONSTRAINT "store_partners_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
