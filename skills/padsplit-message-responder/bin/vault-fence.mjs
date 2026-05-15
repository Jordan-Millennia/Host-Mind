#!/usr/bin/env node
import { readFileSync, writeFileSync, realpathSync } from "node:fs"
import { fileURLToPath } from "node:url"

const FM_RE = /^---\n([\s\S]*?)\n---\n?/

/** Parse flat `key: value` frontmatter. Values: quoted string, bare token, or null. */
export function parseFrontmatter(block) {
  const fm = {}
  for (const line of block.split("\n")) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!m) continue
    const key = m[1]
    let raw = m[2].trim()
    if (raw === "null" || raw === "") fm[key] = raw === "null" ? null : ""
    else if (raw.startsWith('"') && raw.endsWith('"')) fm[key] = raw.slice(1, -1)
    else fm[key] = raw
  }
  return fm
}

/** Returns { frontmatter, regions:{name:{start,end,body}}, hasFence, fmEnd, raw }. */
export function parseVaultFile(content) {
  const fmMatch = content.match(FM_RE)
  if (!fmMatch) throw new Error("No YAML frontmatter block found")
  const frontmatter = parseFrontmatter(fmMatch[1])
  const fmEnd = fmMatch[0].length
  const regions = {}
  const fenceRe = /<!--\s*SWEEP:([a-z0-9-]+)\s*-->([\s\S]*?)<!--\s*\/SWEEP:\1\s*-->/g
  let hasFence = false
  let mm
  while ((mm = fenceRe.exec(content)) !== null) {
    hasFence = true
    const name = mm[1]
    const bodyStart = mm.index + mm[0].indexOf(mm[2])
    regions[name] = { start: bodyStart, end: bodyStart + mm[2].length, body: mm[2] }
  }
  return { frontmatter, regions, hasFence, fmEnd, raw: content }
}

export function replaceRegion(content, name, newBody) {
  const parsed = parseVaultFile(content)
  const region = parsed.regions[name]
  if (!region) throw new Error(`region '${name}' not found`)
  return content.slice(0, region.start) + newBody + content.slice(region.end)
}

export const SWEEP_PROPERTY_KEYS = [
  "padsplit-property-id", "address", "market", "state", "rooms", "status", "last-swept",
]
export const SWEEP_DOSSIER_KEYS = [
  "member-id", "name", "status", "balance", "payment-tier", "days-past-due", "room",
  "property", "move-in-date", "weekly-rate", "move-in-fee", "last-payment-date",
  "last-payment-amount", "phone", "email", "rating", "last-swept",
]

function serializeValue(v) {
  if (v === null) return "null"
  if (/^-?\d+(\.\d+)?$/.test(String(v))) return String(v)
  return `"${String(v).replace(/"/g, '\\"')}"`
}

export function frontmatterSet(content, updates, ownedKeys) {
  for (const k of Object.keys(updates)) {
    if (!ownedKeys.includes(k)) throw new Error(`'${k}' is not a sweep-owned key`)
  }
  const fmMatch = content.match(FM_RE)
  if (!fmMatch) throw new Error("No YAML frontmatter block found")
  const lines = fmMatch[1].split("\n")
  const seen = new Set()
  const outLines = lines.map((line) => {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!m) return line
    const key = m[1]
    if (key in updates) { seen.add(key); return `${key}: ${serializeValue(updates[key])}` }
    return line
  })
  for (const k of ownedKeys) {
    if (k in updates && !seen.has(k)) outLines.push(`${k}: ${serializeValue(updates[k])}`)
  }
  const newFm = `---\n${outLines.join("\n")}\n---\n`
  return newFm + content.slice(fmMatch[0].length)
}

export function unifiedDiff(label, a, b) {
  if (a === b) return ""
  const al = a.split("\n"), bl = b.split("\n")
  const n = al.length, m = bl.length
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = al[i] === bl[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const out = [`--- ${label}`, `+++ ${label} (proposed)`]
  let i = 0, j = 0
  while (i < n && j < m) {
    if (al[i] === bl[j]) { out.push(` ${al[i]}`); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push(`-${al[i]}`); i++ }
    else { out.push(`+${bl[j]}`); j++ }
  }
  while (i < n) out.push(`-${al[i++]}`)
  while (j < m) out.push(`+${bl[j++]}`)
  return out.join("\n") + "\n"
}

function main(argv) {
  const [verb, file] = argv
  if (verb === "parse") {
    const parsed = parseVaultFile(readFileSync(file, "utf8"))
    process.stdout.write(JSON.stringify({
      frontmatter: parsed.frontmatter,
      regions: Object.fromEntries(Object.entries(parsed.regions).map(([k, v]) => [k, { start: v.start, end: v.end }])),
      hasFence: parsed.hasFence,
    }, null, 2) + "\n")
    return
  }
  if (verb === "replace-region") {
    const name = argv[2]
    const bodyFileIdx = argv.indexOf("--body-file")
    const dryRun = argv.includes("--dry-run")
    const body = readFileSync(argv[bodyFileIdx + 1], "utf8")
    const original = readFileSync(file, "utf8")
    const next = replaceRegion(original, name, body)
    if (dryRun) { process.stdout.write(unifiedDiff(file, original, next)); return }
    if (next !== original) writeFileSync(file, next)
    return
  }
  if (verb === "frontmatter-set") {
    const kind = argv[argv.indexOf("--kind") + 1]
    const json = argv[argv.indexOf("--json") + 1]
    const dryRun = argv.includes("--dry-run")
    const ownedKeys = kind === "dossier" ? SWEEP_DOSSIER_KEYS : SWEEP_PROPERTY_KEYS
    const original = readFileSync(file, "utf8")
    const next = frontmatterSet(original, JSON.parse(json), ownedKeys)
    if (dryRun) { process.stdout.write(unifiedDiff(file, original, next)); return }
    if (next !== original) writeFileSync(file, next)
    return
  }
  process.stderr.write(`unknown verb: ${verb}\n`)
  process.exit(1)
}

function invokedDirectly() {
  if (!process.argv[1]) return false
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
  } catch {
    return false
  }
}
if (invokedDirectly()) main(process.argv.slice(2))
