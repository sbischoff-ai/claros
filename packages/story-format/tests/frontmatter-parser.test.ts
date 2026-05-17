import { describe, it, expect } from "vitest"
import { parseNoteFrontmatter, serializeNoteFrontmatter } from "../src/frontmatter/parser.js"

describe("parseNoteFrontmatter", () => {
  it("parses type and aliases", () => {
    const { frontmatter, body } = parseNoteFrontmatter(
      "---\ntype: character\naliases: [the northern mercenary]\n---\n\n# Kareth\n"
    )
    expect(frontmatter.type).toBe("character")
    expect(frontmatter.aliases).toEqual(["the northern mercenary"])
    expect(body.trim()).toBe("# Kareth")
  })

  it("parses the state: key as StateData", () => {
    const { frontmatter } = parseNoteFrontmatter(
      "---\ntype: character\nstate:\n  hp: 12\n  max_hp: 15\n---\n\n# Kareth\n"
    )
    expect(frontmatter.state).toEqual({ hp: 12, max_hp: 15 })
  })

  it("parses nested module-namespaced entity state", () => {
    const { frontmatter } = parseNoteFrontmatter(
      "---\ntype: character\nstate:\n  hp: 12\n  abilities:\n    strength: 14\n---\n\n# Kareth\n"
    )
    expect((frontmatter.state as any)?.abilities?.strength).toBe(14)
  })

  it("returns undefined state when state: key is absent", () => {
    const { frontmatter } = parseNoteFrontmatter("---\ntype: character\n---\n\n# Kareth\n")
    expect(frontmatter.state).toBeUndefined()
  })

  it("returns empty frontmatter and full string as body when no frontmatter block exists", () => {
    const md = "# Kareth\n\nJust prose."
    const { frontmatter, body } = parseNoteFrontmatter(md)
    expect(frontmatter).toEqual({})
    expect(body).toBe(md)
  })

  it("handles an empty frontmatter block", () => {
    const { frontmatter, body } = parseNoteFrontmatter("---\n---\n\n# Kareth\n")
    expect(frontmatter).toEqual({})
    expect(body.trim()).toBe("# Kareth")
  })

  it("round-trips through serialize and parse", () => {
    const frontmatter = {
      type: "character",
      aliases: ["the northern mercenary"],
      state: { hp: 12, max_hp: 15, inventory: ["iron sword"] }
    }
    const body = "\n# Kareth\n\nProse.\n"
    const serialized = serializeNoteFrontmatter(frontmatter, body)
    const { frontmatter: parsed, body: parsedBody } = parseNoteFrontmatter(serialized)
    expect(parsed.type).toBe("character")
    expect(parsed.state).toEqual(frontmatter.state)
    expect(parsedBody).toBe(body)
  })

  it("serialize preserves body exactly — no added or stripped whitespace", () => {
    const body = "\n# The Abandoned Temple\n\nDark and cold.\n"
    const result = serializeNoteFrontmatter({ type: "location" }, body)
    const { body: reparsed } = parseNoteFrontmatter(result)
    expect(reparsed).toBe(body)
  })
})
