import { describe, expect, it } from "vitest";

import {
  DEFAULT_CLAROS_THEME,
  buildThemeStyleProperties,
  findMarkdownMarkerRanges,
} from "../src/index";

describe("editor-core", () => {
  it("builds semantic theme CSS variables from defaults and overrides", () => {
    const properties = buildThemeStyleProperties({
      proseText: "#111111",
      proseFontSize: "21px",
    });

    expect(properties["--claros-prose-text"]).toBe("#111111");
    expect(properties["--claros-prose-font-size"]).toBe("21px");
    expect(properties["--claros-prose-font"]).toBe(DEFAULT_CLAROS_THEME.proseFont);
  });

  it("finds markdown markers that should be visually de-emphasized", () => {
    const markdown = "# Heading\nA **bold** [[Link|label]] and `code`.";
    const ranges = findMarkdownMarkerRanges(markdown);

    expect(ranges).toEqual(
      expect.arrayContaining([
        { from: 0, to: 2, kind: "heading" },
        { from: 12, to: 14, kind: "emphasis" },
        { from: 18, to: 20, kind: "emphasis" },
        { from: 21, to: 23, kind: "link" },
        { from: 33, to: 35, kind: "link" },
        { from: 40, to: 41, kind: "code" },
        { from: 45, to: 46, kind: "code" },
      ])
    );
  });

  it("reveals markdown markers on the active line", () => {
    const markdown = "# Heading\nA **bold** word.";
    const ranges = findMarkdownMarkerRanges(markdown, [{ from: 3, to: 3 }]);

    expect(ranges).not.toContainEqual({ from: 0, to: 2, kind: "heading" });
    expect(ranges).toContainEqual({ from: 12, to: 14, kind: "emphasis" });
  });
});
