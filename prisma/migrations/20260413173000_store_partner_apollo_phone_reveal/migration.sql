ALTER TABLE "store_partners"
ADD COLUMN "apollo_person_id" TEXT,
ADD COLUMN "apollo_has_phone" BOOLEAN,
ADD COLUMN "apollo_phone_reveal_requested_at" TIMESTAMP(3),
ADD COLUMN "apollo_phone_revealed_at" TIMESTAMP(3),
ADD COLUMN "apollo_phone_reveal_error" TEXT;
