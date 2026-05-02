# RoomOS

Internal operator dashboard for CoHost Management. Phase 1A is the foundation: monorepo + Postgres schema + Clerk auth + brand-correct shell.

See `../docs/superpowers/specs/2026-05-02-roomos-phase-1-design.md` for the full spec and `../docs/superpowers/plans/2026-05-02-roomos-phase-1a-foundation.md` for the implementation plan.

## Setup

```bash
cd roomos
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```
