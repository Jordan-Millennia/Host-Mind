# DOSSIERS.md - Member Dossier Companion File

This file governs how the skill reads and writes member dossier files stored in the CoHost Knowledge Hub vault. Load this file whenever dossier read/write, recurrence detection, lockout history, language preference, or vendor intelligence is needed.

## File Location And Naming

Vault path:

`{VAULT}/members/{FirstName}-{LastName}--{PropertySlug}.md`

Rules:

- Double dash (`--`) separates member name from property slug.
- Single hyphens replace spaces within names and property slugs.
- Remove special characters and punctuation.
- Property slug mirrors the full property address.

Example:

`John-Smith--3095-West-63rd-Ave-Denver-CO.md`

## Dossier Schema

Existing fields. Do not remove or rename:

```yaml
name: John Smith
status: Active           # Active | Terminated | Moving in | Moving out
balance: -125            # negative = member owes, PadSplit convention
payment-tier: weekly     # weekly | biweekly | monthly
flags: null              # P0 | P1 | P2 | financial | calendar | null
room: "Room 3"
property: "3095 West 63rd Ave Denver CO"
last-contact: 2026-04-15
rating: 4
last-updated: 2026-04-19
```

Extended fields. Add only when data is available:

```yaml
email-cached: "member@email.com (extracted 2026-04-19)"
language-preference: en       # en | es | mixed

last-lockout: "2026-03-15"
lockout-count: 0
lockout-history:
  - date: "2026-03-15"
    scenario: "PIN"           # PIN | eKey | hardware
    resolution: "Remote PIN reset via TTLock"

maintenance-history:
  - date: "2026-04-10"
    issue: "hot water"
    property: "3095 West 63rd Ave Denver CO"
    status: "reported"        # reported | resolved | ongoing
    reported-by: "member"

vendor-note: null
```

Property-level vendor fields belong in property files, not member dossiers:

```yaml
vendors:
  plumber: "Joe's Plumbing | last used 2026-01-15 | outcome: good"
  electrician: null
  locksmith: null
  cleaner: "Maria C | last used 2026-04-10 | outcome: reliable"
```

Vendor outcomes: `pending`, `good`, `poor`, `unknown`.

## Read Protocol

When loading a member dossier, check fields in this order:

1. `email-cached`: if present and not stale, use it directly for lock operations and skip React fiber extraction.
2. `language-preference`: if `es` or `mixed`, generate a bilingual response this run.
3. `lockout-count`: if 2 or more incidents occurred in the last 30 days, cross-reference `lockout-history` and flag P1 before proceeding.
4. `maintenance-history`: load all entries and pass them to recurrence detection if the current message contains maintenance language.

If no dossier exists, skip gracefully. Create the file at write-back time only if the member was processed or involved in a follow-up.

## Write Protocol

After processing a member conversation, update their dossier in this order.

Always update:

- `last-contact`: set to today's date.
- `last-updated`: set to today's date.

Update when changed:

- `balance`: update when PadSplit shows a different balance than the dossier.
- `status`: update when member status changed this run.
- `flags`: update when a flag was added or cleared this run.

Add when new data is available:

- `email-cached`: store extracted email with extraction date.
- `language-preference`: set to `es` or `mixed` when Spanish/mixed detection triggered.

Lockout events:

1. Increment `lockout-count` by 1.
2. Append an entry to `lockout-history` with `date`, `scenario`, and `resolution`.
3. Update `last-lockout` to today's date.

Maintenance events:

- If reported this run, append to `maintenance-history` with `date`, `issue`, `property`, `status: "reported"`, and `reported-by: "member"`.
- If resolved this run, find the matching open entry by `issue` keyword plus `status: "reported"` and change status to `resolved`.
- Do not create duplicate resolved entries.

Write rules:

- For existing scalar fields, edit the specific YAML line only.
- For arrays, append new entries; never overwrite or truncate history.
- For new members, create a file with all 10 existing fields, then append any observed extended fields.
- If a field line contains `[JORDAN EDIT]`, do not overwrite it. Add a note immediately below.
- Preserve exact file naming: double dash, hyphens for spaces, no special characters.

Example for protected fields:

```yaml
balance: -200  # [JORDAN EDIT]
# skill-note 2026-04-19: PadSplit shows -175; not overwriting per [JORDAN EDIT]
```

## Recurrence Detection

Trigger this protocol whenever a member message contains maintenance-related language.

Trigger keywords include:

- leak, flooding, clog, hot water
- AC, air conditioning, A/C
- heat
- lock, locked out, cannot get in
- pest, infestation
- mold, smell, odor
- broken, not working
- outlet, electrical
- ceiling, roof
- door, window
- appliance

Step 1 - Extract keywords:

- Normalize "air conditioning", "AC unit", and "A/C" to `AC`.
- Normalize "hot water", "no hot water", and "cold water" to `hot water`.
- Normalize "lock", "cannot get in", and "locked out" to `lock`.
- Use the shortest unambiguous label.

Step 2 - Check member dossier:

- Load `maintenance-history`.
- Note all entries matching the extracted keyword and their dates.

Step 3 - Check property file:

- Read the property's `## Maintenance Log` section.
- Collect all entries matching the keyword from any member at the property, with dates.

Step 4 - Count occurrences:

- Count all matching occurrences within 90 days across the dossier and property maintenance log.

Step 5 - Apply thresholds:

- 2 or more occurrences from the same member in 90 days: P1 member recurrence.
- 2 or more occurrences across different members at the same property: P1 systemic issue.
- 3 or more occurrences from any source at the same property for Tier 1 issues: P0 systemic critical.
- 3 or more occurrences from any source at the same property for non-Tier 1 issues: P1 systemic issue.

Tier 1 recurrence issues:

- leak
- flooding
- electrical
- heat in winter
- AC in extreme heat
- pest infestation
- mold

Log format:

```text
[RECURRENCE] [Member Name] @ [Property]: "[issue keyword]" - [N] occurrences in 90 days.
Prior dates: [YYYY-MM-DD, YYYY-MM-DD, ...].
Assessment: [isolated member issue | systemic property issue]
```

## Knowledge Hub Schema Rules

Field timestamps:

- Include update dates where natural, such as `email-cached: "member@email.com (extracted 2026-04-19)"`.
- Use dated YAML comments for skill notes when needed.

Stale flagging:

- If `last-updated` is more than 30 days ago and balance/status remain unchanged from last write, append `[STALE - verify on PadSplit]` to `flags`.
- Example: `flags: "P1 [STALE - verify on PadSplit]"`.

Conflict resolution:

- Live PadSplit data wins over cached dossier data for `balance` and `status`.
- `[JORDAN EDIT]` still takes precedence; add a `# skill-note` instead of overwriting.

Privacy rules:

Do not write to any dossier or log:

- Social Security Numbers.
- Full phone numbers.
- Full financial histories or transaction records.
- Legal case details or court documents.

Email addresses and current balance values are allowed when operationally needed.

## Vendor Intelligence Stub

When a vendor is mentioned or maintenance dispatch is logged:

1. Identify the property from the conversation context.
2. Read the property file.
3. Locate the `vendors:` block under `## Other Notes`, or add it if missing.
4. Append or update the relevant vendor line.
5. Use targeted edits only.

Example:

```yaml
vendors:
  plumber: "Joe's Plumbing | last used 2026-04-19 | outcome: pending"
```

If the same vendor appears again, append dated usage rather than replacing history:

```yaml
plumber: "Joe's Plumbing | last used 2026-01-15 | outcome: good | also used 2026-04-19 | outcome: pending"
```

## Field Ownership

Skill may write:

- `status`
- `balance`
- `flags`
- `last-contact`
- `last-updated`
- `email-cached`
- `language-preference`
- `last-lockout`
- `lockout-count`
- `lockout-history`
- `maintenance-history`
- `vendor-note`
- property-level `vendors:` block

Skill writes only on create:

- `name`
- `property`

Jordan-owned unless explicitly observed:

- `payment-tier`
- `room`
- `rating`

Jordan may edit any field. Respect `[JORDAN EDIT]` and `[DO NOT OVERWRITE]` tags everywhere.
