-- Email ingest: EmailEvent table + EMAIL flag source.

-- AlterEnum
ALTER TYPE "FlagSource" ADD VALUE 'EMAIL';

-- CreateEnum
CREATE TYPE "EmailEventStatus" AS ENUM ('PARSED', 'UNHANDLED', 'ERROR');

-- CreateTable
CREATE TABLE "email_events" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "EmailEventStatus" NOT NULL DEFAULT 'PARSED',
    "parsed_json" JSONB,
    "received_at" TIMESTAMP(3),
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_events_message_id_key" ON "email_events"("message_id");
CREATE INDEX "email_events_org_id_status_idx" ON "email_events"("org_id", "status");

-- AddForeignKey
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
