import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { parseDossier } from "../../src/vault/parsers/dossier"

const FIXTURE = readFileSync(
  join(__dirname, "../fixtures/vault/members/Abhay-Azariah.md"),
  "utf-8",
)

describe("parseDossier", () => {
  it("extracts member-id, name, email, phone from frontmatter", () => {
    const d = parseDossier(FIXTURE, "/abs/path/Abhay-Azariah.md")
    expect(d.memberId).toBe("709784")
    expect(d.name).toBe("Abhay Azariah")
    expect(d.email).toBe("abhay1azariah@gmail.com")
    expect(d.phone).toBe("(980) 875-8074")
    expect(d.weeklyRate).toBe(205)
  })

  it("captures the file path verbatim", () => {
    const d = parseDossier(FIXTURE, "/abs/path/Abhay-Azariah.md")
    expect(d.filePath).toBe("/abs/path/Abhay-Azariah.md")
  })

  it("treats missing frontmatter fields as null, not undefined", () => {
    const d = parseDossier(`---\nname: "x"\n---\n`, "/x.md")
    expect(d.memberId).toBeNull()
    expect(d.email).toBeNull()
    expect(d.weeklyRate).toBeNull()
  })
})
