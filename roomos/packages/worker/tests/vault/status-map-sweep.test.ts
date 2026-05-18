import { describe, it, expect } from "vitest"
import { mapStatusText } from "../../src/vault/persist/occupancy"

// The deep-sweep roster uses Occupied / Vacant / Needs flip / Inactive,
// NOT the legacy Active / VACATED / TERMINATED vocabulary. Unmapped status
// text returns null, which makes upsertOccupancyForListing skip the room —
// i.e. the dashboard shows zero occupants for every swept property.
describe("mapStatusText — deep-sweep vocabulary", () => {
  it.each([
    ["Occupied", "OCCUPIED"],
    ["Vacant", "VACANT"],
    ["Needs flip", "VACANT"],
    ["Inactive", "INACTIVE"],
    ["Moving in", "MOVING_IN"],
    ["Moving out", "MOVING_OUT"],
  ])("maps sweep status %s -> %s", (text, enumVal) => {
    expect(mapStatusText(text)).toBe(enumVal)
  })

  it("still maps the legacy vocabulary (back-compat)", () => {
    expect(mapStatusText("Active")).toBe("OCCUPIED")
    expect(mapStatusText("VACATED")).toBe("VACANT")
    expect(mapStatusText("TERMINATED")).toBe("INACTIVE")
  })
})
