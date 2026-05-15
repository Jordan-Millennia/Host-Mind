// skills/padsplit-message-responder/bin/vault-fence.test.mjs
import { test } from "node:test"
import assert from "node:assert/strict"
import { parseVaultFile, replaceRegion } from "./vault-fence.mjs"

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
