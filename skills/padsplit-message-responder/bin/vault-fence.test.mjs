// skills/padsplit-message-responder/bin/vault-fence.test.mjs
import { test } from "node:test"
import assert from "node:assert/strict"
import { parseVaultFile, replaceRegion, frontmatterSet, SWEEP_PROPERTY_KEYS, SWEEP_DOSSIER_KEYS, unifiedDiff } from "./vault-fence.mjs"
import { migrate } from "./vault-fence.mjs"
import { readFileSync as _rfs } from "node:fs"
import { fileURLToPath as _f2p } from "node:url"
import { dirname as _dn, join as _jn } from "node:path"
const HERE = _dn(_f2p(import.meta.url))
const fx = (n) => _rfs(_jn(HERE, "fixtures", n), "utf8")

const SAMPLE = `---
address: "1311 Morgana Rd, Jacksonville, FL 32205"
rooms: 6
padsplit-property-id: 28685
flags: null
---

# 1311 Morgana Rd

<!-- SWEEP:roster -->
| Room | Member | Status |
|------|--------|--------|
| R1 | Jeffrey Byrd | OCCUPIED |
<!-- /SWEEP:roster -->

## Interaction Log

- 2026-05-01: note
`

test("parseVaultFile extracts flat frontmatter", () => {
  const r = parseVaultFile(SAMPLE)
  assert.equal(r.frontmatter.address, "1311 Morgana Rd, Jacksonville, FL 32205")
  assert.equal(r.frontmatter.rooms, "6")
  assert.equal(r.frontmatter["padsplit-property-id"], "28685")
  assert.equal(r.frontmatter.flags, null)
})

test("parseVaultFile locates the roster region with byte offsets", () => {
  const r = parseVaultFile(SAMPLE)
  assert.ok(r.regions.roster, "roster region found")
  assert.match(r.regions.roster.body, /Jeffrey Byrd/)
  assert.doesNotMatch(r.regions.roster.body, /SWEEP:roster/)
  const { start, end } = r.regions.roster
  assert.equal(SAMPLE.slice(0, start) + SAMPLE.slice(start, end) + SAMPLE.slice(end), SAMPLE)
})

test("parseVaultFile reports hasFence=false when no SWEEP fence present", () => {
  const r = parseVaultFile(`---\naddress: "x"\n---\n# x\n`)
  assert.equal(r.hasFence, false)
  assert.deepEqual(r.regions, {})
})

test("parseVaultFile throws on missing frontmatter", () => {
  assert.throws(() => parseVaultFile("# no frontmatter"), /frontmatter/i)
})

const WITH_ROSTER = `---
address: "x"
---

# x

<!-- SWEEP:roster -->
OLD BODY
<!-- /SWEEP:roster -->

## Interaction Log

- keep me exactly
`

test("replaceRegion swaps only the region body, byte-identical elsewhere", () => {
  const out = replaceRegion(WITH_ROSTER, "roster", "\nNEW TABLE\n")
  assert.match(out, /NEW TABLE/)
  assert.doesNotMatch(out, /OLD BODY/)
  const before = WITH_ROSTER.slice(0, WITH_ROSTER.indexOf("<!-- SWEEP:roster -->"))
  const after = WITH_ROSTER.slice(WITH_ROSTER.indexOf("<!-- /SWEEP:roster -->"))
  assert.ok(out.startsWith(before))
  assert.ok(out.endsWith(after))
})

test("replaceRegion is idempotent for identical body", () => {
  const once = replaceRegion(WITH_ROSTER, "roster", "\nSAME\n")
  const twice = replaceRegion(once, "roster", "\nSAME\n")
  assert.equal(once, twice)
})

test("replaceRegion throws if the region is absent (caller must migrate first)", () => {
  assert.throws(() => replaceRegion(`---\na: 1\n---\n# x\n`, "roster", "y"), /region 'roster' not found/)
})

const FM = `---
address: "1311 Morgana Rd"
rooms: 5
flags: "[JORDAN EDIT] do not auto-touch"
custom-human-key: "keep me"
---

# body unchanged
`

test("frontmatterSet updates only the given sweep keys", () => {
  const out = frontmatterSet(FM, { rooms: "6", "padsplit-property-id": "28685" }, SWEEP_PROPERTY_KEYS)
  assert.match(out, /rooms: 6/)
  assert.match(out, /padsplit-property-id: 28685/)
})

test("frontmatterSet preserves non-sweep keys byte-for-byte (incl. human edits)", () => {
  const out = frontmatterSet(FM, { rooms: "6" }, SWEEP_PROPERTY_KEYS)
  assert.match(out, /flags: "\[JORDAN EDIT\] do not auto-touch"/)
  assert.match(out, /custom-human-key: "keep me"/)
  assert.ok(out.endsWith("\n# body unchanged\n"))
})

test("frontmatterSet refuses to set a key outside the owned set", () => {
  assert.throws(() => frontmatterSet(FM, { "custom-human-key": "hijack" }, SWEEP_PROPERTY_KEYS),
    /not a sweep-owned key/)
})

test("frontmatterSet is idempotent", () => {
  const a = frontmatterSet(FM, { rooms: "6" }, SWEEP_PROPERTY_KEYS)
  const b = frontmatterSet(a, { rooms: "6" }, SWEEP_PROPERTY_KEYS)
  assert.equal(a, b)
})

test("unifiedDiff shows only changed lines and writes nothing", () => {
  const a = "line1\nOLD\nline3\n"
  const b = "line1\nNEW\nline3\n"
  const d = unifiedDiff("f.md", a, b)
  assert.match(d, /-OLD/)
  assert.match(d, /\+NEW/)
  assert.doesNotMatch(d, /line1.*\n.*line1/)
})

test("unifiedDiff is empty string when identical", () => {
  assert.equal(unifiedDiff("f.md", "same\n", "same\n"), "")
})

const LEGACY_PROPERTY = `---
address: "733 Tarpon Ave, Sarasota, FL 34237"
rooms: 6
platform: "PadSplit"
---

# 733 Tarpon Ave

## Current Members

| Room | Name | Status | Balance Due | Notes |
|------|------|--------|-------------|-------|
| R1 | Jeffrey Byrd | Active | $0 | |

## Interaction Log

- 2026-05-01: existing note KEEP
`

test("migrate inserts a roster fence wrapping the existing Current Members table", () => {
  const out = migrate(LEGACY_PROPERTY, "property")
  assert.match(out, /<!-- SWEEP:roster -->/)
  assert.match(out, /<!-- \/SWEEP:roster -->/)
  const r = parseVaultFile(out).regions.roster
  assert.match(r.body, /Jeffrey Byrd/)
  assert.match(out, /existing note KEEP/)
})

test("migrate adds canonical frontmatter keys (null where unknown)", () => {
  const out = migrate(LEGACY_PROPERTY, "property")
  const fm = parseVaultFile(out).frontmatter
  assert.ok("padsplit-property-id" in fm)
  assert.ok("status" in fm)
  assert.ok("last-swept" in fm)
})

test("migrate is detect-and-skip: second run is byte-identical", () => {
  const once = migrate(LEGACY_PROPERTY, "property")
  const twice = migrate(once, "property")
  assert.equal(once, twice)
})

test("migrate on a dossier inserts canonical dossier keys incl. property", () => {
  const legacyDossier = `---\nname: "Abhay Azariah"\nbalance: "0.00"\nproperty: null\n---\n\n# Dossier\n`
  const out = migrate(legacyDossier, "dossier")
  const fm = parseVaultFile(out).frontmatter
  assert.ok("member-id" in fm)
  assert.ok("days-past-due" in fm)
  assert.equal(fm.property, null)
})

test("migrate(property-legacy) === property-fenced fixture", () => {
  assert.equal(migrate(fx("property-legacy.md"), "property"), fx("property-fenced.md"))
})
test("migrate(dossier-legacy) === dossier-fenced fixture", () => {
  assert.equal(migrate(fx("dossier-legacy.md"), "dossier"), fx("dossier-fenced.md"))
})
test("re-migrating the fenced fixtures is a no-op", () => {
  assert.equal(migrate(fx("property-fenced.md"), "property"), fx("property-fenced.md"))
  assert.equal(migrate(fx("dossier-fenced.md"), "dossier"), fx("dossier-fenced.md"))
})
