// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";
import { EditorView } from "@codemirror/view";

import { createMarkdownEditor, type ClarosMarkdownEditor } from "../src/index";

describe("markdown boundary navigation", () => {
  it("navigates up after two quick boundary motions", () => {
    withEditor("First line\nSecond line", ({ content, navigate }) => {
      press(content, "ArrowUp");
      press(content, "ArrowUp");

      expect(navigate).toHaveBeenCalledOnce();
      expect(navigate).toHaveBeenCalledWith("up");
    });
  });

  it("navigates down after two quick boundary motions", () => {
    withEditor("First line\nSecond line", ({ editor, content, navigate }) => {
      editor.focus({ cursor: "end" });
      press(content, "ArrowDown");
      press(content, "ArrowDown");

      expect(navigate).toHaveBeenCalledOnce();
      expect(navigate).toHaveBeenCalledWith("down");
    });
  });

  it("requires distinct presses within 500 ms", () => {
    vi.useFakeTimers();
    withEditor("First line", ({ content, navigate }) => {
      press(content, "ArrowUp");
      vi.advanceTimersByTime(501);
      press(content, "ArrowUp");
      press(content, "ArrowUp", { repeat: true });

      expect(navigate).not.toHaveBeenCalled();
    });
    vi.useRealTimers();
  });

  it("resets after an intervening key, direction change, or modified motion", () => {
    withEditor("First line", ({ content, navigate }) => {
      press(content, "ArrowUp");
      press(content, "x");
      press(content, "ArrowUp");
      press(content, "ArrowDown");
      press(content, "ArrowUp", { shiftKey: true });
      press(content, "ArrowUp");

      expect(navigate).not.toHaveBeenCalled();
    });
  });

  it("resets after editor focus leaves the content", () => {
    withEditor("First line", ({ content, navigate }) => {
      press(content, "ArrowUp");
      content.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
      press(content, "ArrowUp");

      expect(navigate).not.toHaveBeenCalled();
    });
  });

  it("does not navigate away from a boundary", () => {
    withEditor("First line\nMiddle line\nLast line", ({ editor, content, navigate }) => {
      editor.focus({ cursor: "First line\n".length });
      press(content, "ArrowUp");
      press(content, "ArrowUp");

      expect(navigate).not.toHaveBeenCalled();
    });
  });

  it("does not navigate with a non-empty selection", () => {
    withEditor("First line", ({ content, navigate }) => {
      const view = EditorView.findFromDOM(content);
      if (view === null) {
        throw new Error("Expected CodeMirror editor view");
      }
      view.dispatch({ selection: { anchor: 0, head: 5 } });

      press(content, "ArrowUp");
      press(content, "ArrowUp");

      expect(navigate).not.toHaveBeenCalled();
    });
  });

  it("resets after navigation is rejected", () => {
    withEditor(
      "First line",
      ({ content, navigate }) => {
        press(content, "ArrowUp");
        press(content, "ArrowUp");
        press(content, "ArrowUp");

        expect(navigate).toHaveBeenCalledOnce();
      },
      { acceptNavigation: false }
    );
  });

  it("supports j and k only in Vim normal mode", () => {
    withEditor(
      "First line",
      ({ content, navigate }) => {
        press(content, "k");
        press(content, "k");
        expect(navigate).toHaveBeenCalledWith("up");

        press(content, "i");
        press(content, "j");
        press(content, "j");
        expect(navigate).toHaveBeenCalledTimes(1);
      },
      { vimMode: true }
    );
  });
});

interface EditorTestOptions {
  acceptNavigation?: boolean;
  vimMode?: boolean;
}

function withEditor(
  markdown: string,
  run: (context: {
    editor: ClarosMarkdownEditor;
    content: HTMLElement;
    navigate: ReturnType<typeof vi.fn>;
  }) => void,
  options: EditorTestOptions = {}
): void {
  const parent = document.createElement("div");
  document.body.append(parent);
  const navigate = vi.fn(() => options.acceptNavigation ?? true);
  const editor = createMarkdownEditor({
    parent,
    doc: markdown,
    vimMode: options.vimMode,
    onBoundaryNavigation: navigate,
  });
  editor.focus({ cursor: "start" });
  const content = parent.querySelector<HTMLElement>(".cm-content");
  if (content === null) {
    throw new Error("Expected CodeMirror content element");
  }

  try {
    run({ editor, content, navigate });
  } finally {
    editor.destroy();
    parent.remove();
  }
}

function press(
  content: HTMLElement,
  key: string,
  options: { repeat?: boolean; shiftKey?: boolean } = {}
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    repeat: options.repeat ?? false,
    shiftKey: options.shiftKey ?? false,
    bubbles: true,
    cancelable: true,
  });
  content.dispatchEvent(event);
  return event;
}
