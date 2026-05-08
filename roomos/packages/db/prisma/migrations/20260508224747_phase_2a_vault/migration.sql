-- CreateEnum
CREATE TYPE "FlagSeverity" AS ENUM ('DANGER', 'WARN', 'INFO', 'OK');

-- CreateEnum
CREATE TYPE "FlagSource" AS ENUM ('VAULT_SYNC', 'AIRBNB', 'REI_HUB', 'MANUAL');

-- AlterEnum
ALTER TYPE "SyncKind" ADD VALUE 'VAULT_SYNC';

-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "padsplit_property_id" TEXT,
ADD COLUMN     "vault_file_path" TEXT;

-- AlterTable
ALTER TABLE "members" ADD COLUMN     "member_dossier_path" TEXT;

-- CreateTable
CREATE TABLE "property_flags" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "room_id" TEXT,
    "severity" "FlagSeverity" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "source" "FlagSource" NOT NULL,
    "source_ref" TEXT,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "property_flags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "property_flags_org_id_property_id_closed_at_idx" ON "property_flags"("org_id", "property_id", "closed_at");

-- CreateIndex
CREATE INDEX "property_flags_org_id_severity_closed_at_idx" ON "property_flags"("org_id", "severity", "closed_at");

-- CreateIndex
CREATE UNIQUE INDEX "property_flags_property_id_source_source_ref_key" ON "property_flags"("property_id", "source", "source_ref");

-- CreateIndex
CREATE UNIQUE INDEX "properties_padsplit_property_id_key" ON "properties"("padsplit_property_id");

-- AddForeignKey
ALTER TABLE "property_flags" ADD CONSTRAINT "property_flags_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_flags" ADD CONSTRAINT "property_flags_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

