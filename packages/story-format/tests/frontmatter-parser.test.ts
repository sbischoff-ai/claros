import { describe, it, expect } from "vitest";
import { parseNoteFrontmatter, serializeNoteFrontmatter } from "../src/frontmatter/parser.js";

describe("parseNoteFrontmatter", () => {
  it("parses title/type/aliases", () => {
    const { frontmatter, body } = parseNoteFrontmatter(
      "---\ntitle: Kareth\ntype: character\naliases: [the northern mercenary]\n---\n\n# Kareth\n"
    );
    expect(frontmatter.title).toBe("Kareth");
    expect(frontmatter.type).toBe("character");
    expect(frontmatter.aliases).toEqual(["the northern mercenary"]);
    expect(body.trim()).toBe("# Kareth");
  });

  it("preserves arbitrary top-level module keys", () => {
    const { frontmatter } = parseNoteFrontmatter(
      "---\ntype: character\nosr:\n  hp:\n    current: 12\n    max: 15\nmythic:\n  status: interrupted\n---\n\n# Kareth\n"
    );
    expect(frontmatter.osr).toEqual({ hp: { current: 12, max: 15 } });
    expect(frontmatter.mythic).toEqual({ status: "interrupted" });
  });

  it("preserves unknown top-level keys", () => {
    const { frontmatter } = parseNoteFrontmatter(
      "---\ntype: character\ncustom_flag: true\nironsworn:\n  momentum: 2\n---\n\n# Kareth\n"
    );
    expect(frontmatter.custom_flag).toBe(true);
    expect(frontmatter.ironsworn).toEqual({ momentum: 2 });
  });

  it("treats a top-level state key as ordinary frontmatter", () => {
    const { frontmatter } = parseNoteFrontmatter(
      "---\ntitle: Kareth\nstate:\n  hp: 12\nosr:\n  hp:\n    current: 12\n---\n\n# Kareth\n"
    );
    expect(frontmatter.title).toBe("Kareth");
    expect(frontmatter.state).toEqual({ hp: 12 });
    expect(frontmatter.osr).toEqual({ hp: { current: 12 } });
  });

  it("returns empty frontmatter and full string as body when no frontmatter block exists", () => {
    const md = "# Kareth\n\nJust prose.";
    const { frontmatter, body } = parseNoteFrontmatter(md);
    expect(frontmatter).toEqual({});
    expect(body).toBe(md);
  });

  it("handles an empty frontmatter block", () => {
    const { frontmatter, body } = parseNoteFrontmatter("---\n---\n\n# Kareth\n");
    expect(frontmatter).toEqual({});
    expect(body.trim()).toBe("# Kareth");
  });

  it("round-trips through serialize and parse", () => {
    const frontmatter = {
      type: "character",
      aliases: ["the northern mercenary"],
      osr: { hp: { current: 12, max: 15 }, inventory: ["iron sword"] },
      mythic: { status: "interrupted" },
    };
    const body = "\n# Kareth\n\nProse.\n";
    const serialized = serializeNoteFrontmatter(frontmatter, body);
    const { frontmatter: parsed, body: parsedBody } = parseNoteFrontmatter(serialized);
    expect(parsed.type).toBe("character");
    expect(parsed.osr).toEqual(frontmatter.osr);
    expect(parsed.mythic).toEqual(frontmatter.mythic);
    expect(parsedBody).toBe(body);
  });

  it("serialize preserves body exactly — no added or stripped whitespace", () => {
    const body = "\n# The Abandoned Temple\n\nDark and cold.\n";
    const result = serializeNoteFrontmatter({ type: "location" }, body);
    const { body: reparsed } = parseNoteFrontmatter(result);
    expect(reparsed).toBe(body);
  });
});
