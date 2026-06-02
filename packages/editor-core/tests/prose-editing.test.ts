// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { createMarkdownEditor, type ClarosMarkdownEditor } from "../src/index";

describe("markdown prose editing", () => {
  it("inserts a Markdown paragraph gap when Enter is pressed on prose", () => {
    withEditor("First paragraph", (editor, content) => {
      press(content, "Enter");

      expect(editor.getMarkdown()).toBe("First paragraph\n\n");
    });
  });

  it("inserts a single line break when Enter is pressed on an empty line", () => {
    withEditor("First paragraph\n", (editor, content) => {
      press(content, "Enter");

      expect(editor.getMarkdown()).toBe("First paragraph\n\n");
    });
  });

  it("removes indentation-only whitespace when Enter is pressed", () => {
    withEditor("First paragraph\n   ", (editor, content) => {
      press(content, "Enter");

      expect(editor.getMarkdown()).toBe("First paragraph\n\n");
    });
  });

  it("does not continue Markdown markup when Enter starts a paragraph", () => {
    withEditor("> Quoted text", (editor, content) => {
      press(content, "Enter");

      expect(editor.getMarkdown()).toBe("> Quoted text\n\n");
    });
  });

  it("continues a blockquote when Shift+Enter is pressed", () => {
    withEditor("> Quoted text", (editor, content) => {
      press(content, "Enter", { shiftKey: true });

      expect(editor.getMarkdown()).toBe("> Quoted text\n> ");
    });
  });

  it("continues a list when Shift+Enter is pressed", () => {
    withEditor("- First item", (editor, content) => {
      press(content, "Enter", { shiftKey: true });

      expect(editor.getMarkdown()).toBe("- First item\n- ");
    });
  });

  it("keeps ordinary indentation when Shift+Enter is pressed", () => {
    withEditor("    indented text", (editor, content) => {
      press(content, "Enter", { shiftKey: true });

      expect(editor.getMarkdown()).toBe("    indented text\n    ");
    });
  });

  it("exits an empty blockquote when Enter is pressed", () => {
    withEditor("> Quoted text\n> ", (editor, content) => {
      press(content, "Enter");

      expect(editor.getMarkdown()).toBe("> Quoted text\n\n");
    });
  });

  it("exits an empty list item when Enter is pressed", () => {
    withEditor("- First item\n- ", (editor, content) => {
      press(content, "Enter");

      expect(editor.getMarkdown()).toBe("- First item\n\n");
    });
  });

  it("keeps Enter literal in Vim mode and restores paragraph breaks when Vim is disabled", () => {
    withEditor(
      "First paragraph",
      (editor, content) => {
        press(content, "i");
        press(content, "Enter");
        expect(editor.getMarkdown()).toBe("First paragraph\n");

        editor.setVimMode(false);
        editor.setMarkdown("First paragraph", { cursor: "end" });
        press(content, "Enter");
        expect(editor.getMarkdown()).toBe("First paragraph\n\n");
      },
      { vimMode: true }
    );
  });
});

interface EditorTestOptions {
  vimMode?: boolean;
}

function withEditor(
  markdown: string,
  run: (editor: ClarosMarkdownEditor, content: HTMLElement) => void,
  options: EditorTestOptions = {}
): void {
  const parent = document.createElement("div");
  document.body.append(parent);
  const editor = createMarkdownEditor({ parent, doc: markdown, vimMode: options.vimMode });
  editor.focus({ cursor: "end" });
  const content = parent.querySelector<HTMLElement>(".cm-content");
  if (content === null) {
    throw new Error("Expected CodeMirror content element");
  }

  try {
    run(editor, content);
  } finally {
    editor.destroy();
    parent.remove();
  }
}

function press(content: HTMLElement, key: string, options: { shiftKey?: boolean } = {}): void {
  content.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      shiftKey: options.shiftKey ?? false,
      bubbles: true,
      cancelable: true,
    })
  );
}
