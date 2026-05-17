import { describe, expect, it } from "vitest";

import {
  CLAROS_THEMES,
  DEFAULT_CLAROS_THEME,
  buildThemeStyleProperties,
  findMarkdownPresentationRanges,
  findMarkdownMarkerRanges,
  getClarosTheme,
  isClarosThemeId,
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

  it("defines all named theme variants with complete tokens", () => {
    expect(CLAROS_THEMES.map((theme) => theme.id)).toEqual([
      "default-light",
      "default-dark",
      "gruvbox-light",
      "gruvbox-dark",
      "solarized-light",
      "solarized-dark",
      "everforest-light",
      "everforest-dark",
      "catppuccin-light",
      "catppuccin-dark",
    ]);

    const tokenNames = Object.keys(DEFAULT_CLAROS_THEME);
    for (const theme of CLAROS_THEMES) {
      expect(Object.keys(theme.tokens).sort()).toEqual([...tokenNames].sort());
    }
  });

  it("recognizes valid theme ids", () => {
    expect(isClarosThemeId("gruvbox-dark")).toBe(true);
    expect(isClarosThemeId("unknown")).toBe(false);
    expect(getClarosTheme("catppuccin-dark").label).toBe("Catppuccin Dark");
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

  it("finds parser-backed markdown presentation ranges", () => {
    const markdown = "# Chapter\n\n## Scene\nA *quiet* and **strong** line.";
    const ranges = findMarkdownPresentationRanges(markdown);

    expect(ranges).toEqual(
      expect.arrayContaining([
        { from: 0, to: 9, kind: "heading1" },
        { from: 11, to: 19, kind: "heading2" },
        { from: 23, to: 28, kind: "emphasis" },
        { from: 36, to: 42, kind: "strong" },
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
