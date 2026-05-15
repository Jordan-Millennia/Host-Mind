# Knowledge Hub

Use this file before reading or editing the CoHost Knowledge Hub.

## Discovery

Find the vault at runtime. Prefer exact known workspace mounts, then broader searches:

```bash
find /sessions /mnt "$PWD" "$HOME/Documents" -maxdepth 6 -name "_INDEX.md" -path "*/CoHost-Knowledge-Hub/*" 2>/dev/null | head -1 | sed 's/_INDEX.md//'
```

If the command returns empty or access is denied, set `hub_available = false`, log `Knowledge Hub vault not found - skipping hub this run`, and continue without hub lookups.

Core files:

- `_INDEX.md`: property list and file names.
- `_RUN-LOG.md`: run log.
- `_RISK-LEDGER.md`: risk entries.
- `_REVENUE.md`: revenue entries.
- `_VOICE-DRIFT-LOG.md`: learned voice corrections.
- `members/`: member dossier files.

## Loading

- Read `_INDEX.md` once.
- Do not preload all properties.
- Load property files on demand and cache them in `hub_cache`.
- Load member dossiers on demand and cache them in `dossier_cache`.
- Read the last 10 `Pattern:` lines from `_VOICE-DRIFT-LOG.md` if present.

## Lookup Order

For every factual reply:

1. Use `hub_cache` if already loaded.
2. Read the relevant property file from the hub.
3. If missing, check PadSplit/Airbnb dashboard.
4. If found in dashboard, reply with the fact and queue targeted write-back.
5. If still unknown, say it needs verification and log the gap.

## Write-Back Triggers

Capture concise, dated, sourced facts:

- WiFi network/password.
- Parking rules.
- Appliance/amenity presence or quirks.
- Maintenance reports and status changes.
- House rules and corrective messages.
- Check-in/access details.
- Room number, rate, and room notes.
- Broken/missing items.
- Nearby amenities.
- PadSplit eKeys/PINs issued.
- Airbnb timed PINs/eKeys issued.
- Airbnb checkout verified.
- House broadcasts.
- Useful manual Jordan replies.

Never write guesses as facts. Mark uncertain items `(unconfirmed - needs verification)`.

## Property File Updates

Use targeted edits only:

- Append to `## Interaction Log` above `<!-- Claude appends entries here after each session -->` if that marker exists.
- Do NOT edit the `SWEEP:roster` table or sweep-owned frontmatter for observed status/balance changes (see Section Ownership below); instead append the observation to `## Interaction Log` and let the next deep sweep reconcile the structured fields.
- Update `## Open Maintenance Items`, `## Maintenance Log`, and `## Flags & Alerts` for observed events.
- Add vendor stubs under `## Vendors` or `## Other Notes`.
- Respect `[JORDAN EDIT]` and `[DO NOT OVERWRITE]`: append an observation instead of replacing.

## Section Ownership (Deep-Sweep Contract)

Two writers touch vault files: this reactive responder and the deep sweep
(`references/deep-sweep.md`). Regions are owned. A writer never edits a region
it does not own.

- **Sweep-owned:** YAML frontmatter (the canonical keys listed in
  `bin/vault-fence.mjs` `SWEEP_PROPERTY_KEYS` / `SWEEP_DOSSIER_KEYS`) and the
  `<!-- SWEEP:roster -->…<!-- /SWEEP:roster -->` region.
- **Responder-owned:** `## Interaction Log`, `## Flags & Alerts`,
  `## Open Maintenance Items`, and all dossier narrative sections.

When this reactive responder needs to record an observed status/balance change
for a member, it MUST NOT edit the `SWEEP:roster` table or sweep frontmatter
keys directly. Instead, append the observation to `## Interaction Log` and let
the next deep sweep reconcile the structured fields. The sweep is authoritative
for structured truth; the responder is authoritative for narrative.

If a file lacks the `SWEEP:roster` fence, do not add it here — the deep sweep's
migration owns fence insertion. Treat a fence-less file as legacy and use the
existing targeted-edit rules until the sweep migrates it.

## Airbnb Occupancy

For properties with Airbnb messages or checkout sweeps, update `## Current Airbnb Occupancy`:

- New/pre-arrival: guest first name, room if known, check-in/out dates, status.
- During stay: update notes.
- Checkout passed/confirmed: set `checked out` after lock verification.
- Access provisioned: record timed PIN/eKey names and access window.

## Run Log

Append a structured entry to `_RUN-LOG.md`; fall back to `/tmp/padsplit-log.txt` if the hub is unavailable.

Include:

- Timestamp.
- PadSplit replies count.
- Airbnb replies count.
- Follow-up actions count.
- Lock actions count.
- Cross-platform incidents count.
- Inbox scan depth for each platform: unique conversations scanned, oldest timestamp/date reached, and stop reason.
- Same-day unresponded backfill counts: checked, replied, skipped.
- Reply summaries with F/T/S scores.
- Follow-up actions.
- Lock actions.
- Past-due outreach.
- Knowledge Hub updates.
- P1, P2, and P0 flags.
- Run health with `CLEAN`, `REVIEW-NEEDED`, or `DEGRADED`.

Use `DEGRADED` when the lock system is down, the hub is unreadable for a hub-required run, or more than 30% of messages could not be processed.

## Guardrails

- Never overwrite whole property files for routine edits.
- Never store SSNs, DOBs, phone numbers, documents, or private strategy notes.
- Email addresses are allowed when operationally observed.
- Keep entries short enough for future runs to scan quickly.
