#!/usr/bin/env node
import { readFileSync, realpathSync } from "node:fs"
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
