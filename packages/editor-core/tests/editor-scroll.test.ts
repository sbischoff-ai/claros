// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";
import { EditorView } from "@codemirror/view";

import { createMarkdownEditor } from "../src/index";

describe("ClarosMarkdownEditor scrolling", () => {
  it("requests that CodeMirror scroll the current selection into view", () => {
    const scrollIntoView = vi.spyOn(EditorView, "scrollIntoView");
    const parent = document.createElement("div");
    document.body.append(parent);
    const editor = createMarkdownEditor({ parent, doc: "Scene body." });

    editor.scrollSelectionIntoView();

    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ from: 0, to: 0 }), {
      y: "nearest",
    });
    editor.destroy();
    parent.remove();
    scrollIntoView.mockRestore();
  });
});
