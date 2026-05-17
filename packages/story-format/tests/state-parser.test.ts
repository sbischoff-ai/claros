import { describe, it, expect } from "vitest"
import { parseStateFile, serializeStateFile } from "../src/state/parser.js"
import type { StateFile } from "../src/state/types.js"

describe("parseStateFile", () => {
  it("parses a simple state file", () => {
    const file = parseStateFile("mythic:\n  chaos_factor: 5\n")
    expect((file.data.mythic as any).chaos_factor).toBe(5)
  })

  it("parses multiple module namespaces", () => {
    const file = parseStateFile("mythic:\n  chaos_factor: 5\nironsworn:\n  momentum: 3\n")
    expect((file.data.mythic as any).chaos_factor).toBe(5)
    expect((file.data.ironsworn as any).momentum).toBe(3)
  })

  it("parses a nested list", () => {
    const yaml = `
mythic:
  threads:
    - name: "The Conspiracy"
      status: active
`
    const file = parseStateFile(yaml)
    const threads = (file.data.mythic as any).threads as any[]
    expect(threads).toHaveLength(1)
    expect(threads[0].name).toBe("The Conspiracy")
  })

  it("parses an empty or whitespace-only string as empty data", () => {
    expect(parseStateFile("").data).toEqual({})
    expect(parseStateFile("   ").data).toEqual({})
  })

  it("round-trips through serialize and parse without data loss", () => {
    const original: StateFile = {
      data: {
        mythic: { chaos_factor: 5, npcs: ["kareth", "the-priest"] },
        ironsworn: { momentum: 3 }
      }
    }
    const roundTripped = parseStateFile(serializeStateFile(original))
    expect(roundTripped.data).toEqual(original.data)
  })
})
