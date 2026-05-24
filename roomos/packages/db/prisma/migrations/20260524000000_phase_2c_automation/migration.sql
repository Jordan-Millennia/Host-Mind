-- Phase 2C — operational automation side-effect state.
-- All columns are nullable additions (no backfill, no locking concern).

-- AlterTable: GHL Room Tracker sync state (per room)
ALTER TABLE "rooms" ADD COLUMN "ghl_opportunity_id" TEXT;
ALTER TABLE "rooms" ADD COLUMN "ghl_stage_id" TEXT;
ALTER TABLE "rooms" ADD COLUMN "ghl_synced_at" TIMESTAMP(3);

-- AlterTable: TTLock access-code + Turno cleaning-job state (per occupancy)
ALTER TABLE "occupancies" ADD COLUMN "access_code" TEXT;
ALTER TABLE "occupancies" ADD COLUMN "access_code_id" TEXT;
ALTER TABLE "occupancies" ADD COLUMN "access_code_lock_id" TEXT;
ALTER TABLE "occupancies" ADD COLUMN "access_code_synced_at" TIMESTAMP(3);
ALTER TABLE "occupancies" ADD COLUMN "turno_job_id" TEXT;
ALTER TABLE "occupancies" ADD COLUMN "turno_job_created_at" TIMESTAMP(3);
