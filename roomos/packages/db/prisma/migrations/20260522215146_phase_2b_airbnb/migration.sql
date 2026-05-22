-- AlterEnum
ALTER TYPE "SyncKind" ADD VALUE 'AIRBNB_SYNC';

-- DropForeignKey
ALTER TABLE "platform_listings" DROP CONSTRAINT "platform_listings_room_id_fkey";

-- DropIndex
DROP INDEX "platform_listings_room_id_platform_key";

-- AlterTable
ALTER TABLE "platform_listings" ALTER COLUMN "room_id" DROP NOT NULL;

-- Backfill: existing PADSPLIT listings (created by Phase 2A vault sync) have
-- external_listing_id = NULL. The Phase 2B vault writer now upserts by
-- (platform, external_listing_id) using '<padsplit_property_id>:<room_number>'.
-- Without this backfill the next sync would not match these rows and would
-- insert duplicate listings. Set the same key the writer computes so the
-- upsert matches in place. Runs before the unique index so any (unexpected)
-- collision fails the migration loudly rather than silently duplicating.
UPDATE "platform_listings" pl
SET "external_listing_id" = p."padsplit_property_id" || ':' || r."room_number"
FROM "rooms" r
JOIN "properties" p ON p."id" = r."property_id"
WHERE pl."room_id" = r."id"
  AND pl."platform" = 'PADSPLIT'
  AND pl."external_listing_id" IS NULL
  AND p."padsplit_property_id" IS NOT NULL
  AND r."room_number" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "platform_listings_platform_external_listing_id_key" ON "platform_listings"("platform", "external_listing_id");

-- AddForeignKey
ALTER TABLE "platform_listings" ADD CONSTRAINT "platform_listings_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

