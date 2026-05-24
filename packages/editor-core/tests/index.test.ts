import { describe, expect, it } from "vitest";
import { history, undo } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";

import {
  CLAROS_THEMES,
  DEFAULT_CLAROS_THEME,
  buildThemeStyleProperties,
  findMarkdownPresentationRanges,
  findMarkdownMarkerRanges,
  findMarkdownWikilinkReferences,
  getClarosTheme,
  isClarosThemeId,
  resolveMarkdownCursorPosition,
  wikilinkAtCursor,
} from "../src/index";
import { MarkdownDocumentStateStore } from "../src/editor";

describe("editor-core", () => {
  it("builds semantic theme CSS variables from defaults and overrides", () => {
    const properties = buildThemeStyleProperties({
      proseText: "#111111",
      proseFontSize: "21px",
    });

    expect(properties["--claros-prose-text"]).toBe("#111111");
    expect(properties["--claros-prose-font-size"]).toBe("21px");
    expect(properties["--claros-prose-font"]).toBe(DEFAULT_CLAROS_THEME.proseFont);
    expect(properties["--claros-status-okay"]).toBe(DEFAULT_CLAROS_THEME.statusOkay);
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

  it("resolves requested editor cursor positions", () => {
    expect(resolveMarkdownCursorPosition(12, "start")).toBe(0);
    expect(resolveMarkdownCursorPosition(12, "end")).toBe(12);
    expect(resolveMarkdownCursorPosition(12, 5)).toBe(5);
    expect(resolveMarkdownCursorPosition(12, -4)).toBe(0);
    expect(resolveMarkdownCursorPosition(12, 30)).toBe(12);
    expect(resolveMarkdownCursorPosition(12, 4.8)).toBe(4);
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

  it("finds wikilink display ranges and suppresses active-line rendering", () => {
    const markdown = "See [[Ancient Ruin|the ruin]].\nThen [[Kareth]].";

    expect(findMarkdownWikilinkReferences(markdown)).toEqual([
      {
        raw: "[[Ancient Ruin|the ruin]]",
        target: "Ancient Ruin",
        alias: "the ruin",
        from: 4,
        to: 29,
        displayFrom: 19,
        displayTo: 27,
      },
      {
        raw: "[[Kareth]]",
        target: "Kareth",
        alias: undefined,
        from: 36,
        to: 46,
        displayFrom: 38,
        displayTo: 44,
      },
    ]);

    expect(findMarkdownWikilinkReferences(markdown, [{ from: 8, to: 8 }])).toHaveLength(1);
  });

  it("detects a wikilink when the cursor is inside or adjacent to the raw link", () => {
    const markdown = "See [[Kareth]].";

    expect(wikilinkAtCursor(markdown, 4)?.target).toBe("Kareth");
    expect(wikilinkAtCursor(markdown, 8)?.target).toBe("Kareth");
    expect(wikilinkAtCursor(markdown, 15)?.target).toBe("Kareth");
    expect(wikilinkAtCursor(markdown, 2)).toBeUndefined();
  });

  it("keeps undo history scoped to the active markdown document", () => {
    let activeState = createHistoryState("Alpha");
    const states = new MarkdownDocumentStateStore("alpha.md", activeState);

    activeState = activeState.update({ changes: { from: 5, insert: "!" } }).state;
    states.setActiveState(activeState);
    activeState = states.loadDocument("beta.md", "Beta", createHistoryState);

    const changed = undo({
      state: activeState,
      dispatch: (transaction) => {
        activeState = transaction.state;
      },
    });

    expect(changed).toBe(false);
    expect(activeState.doc.toString()).toBe("Beta");
  });

  it("restores each markdown document with its own undo stack", () => {
    let activeState = createHistoryState("Alpha");
    const states = new MarkdownDocumentStateStore("alpha.md", activeState);

    activeState = activeState.update({ changes: { from: 5, insert: "!" } }).state;
    states.setActiveState(activeState);

    activeState = states.loadDocument("beta.md", "Beta", createHistoryState);
    activeState = activeState.update({ changes: { from: 4, insert: "?" } }).state;
    states.setActiveState(activeState);

    activeState = states.loadDocument("alpha.md", "Alpha!", createHistoryState);
    expect(undoActiveState()).toBe(true);
    expect(activeState.doc.toString()).toBe("Alpha");
    states.setActiveState(activeState);

    activeState = states.loadDocument("beta.md", "Beta?", createHistoryState);
    expect(undoActiveState()).toBe(true);
    expect(activeState.doc.toString()).toBe("Beta");

    function undoActiveState(): boolean {
      return undo({
        state: activeState,
        dispatch: (transaction) => {
          activeState = transaction.state;
        },
      });
    }
  });
});

function createHistoryState(markdown: string): EditorState {
  return EditorState.create({ doc: markdown, extensions: [history()] });
}
