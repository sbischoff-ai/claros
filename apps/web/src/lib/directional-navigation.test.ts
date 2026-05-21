import { describe, expect, it } from "vitest";

import { directionalIntentFromKeydown, isTextEditingTarget } from "./directional-navigation";

describe("directional navigation", () => {
  it("maps arrow and Vim keys to physical directions", () => {
    expect(intent("ArrowUp")).toBe("up");
    expect(intent("k")).toBe("up");
    expect(intent("ArrowDown")).toBe("down");
    expect(intent("j")).toBe("down");
    expect(intent("ArrowLeft")).toBe("left");
    expect(intent("h")).toBe("left");
    expect(intent("ArrowRight")).toBe("right");
    expect(intent("l")).toBe("right");
    expect(intent("Enter")).toBe("activate");
  });

  it("ignores modified key chords", () => {
    expect(intent("j", { ctrlKey: true })).toBeUndefined();
    expect(intent("ArrowDown", { shiftKey: true })).toBeUndefined();
    expect(intent("l", { metaKey: true })).toBeUndefined();
    expect(intent("h", { altKey: true })).toBeUndefined();
  });

  it("does not create intents for text-editing targets", () => {
    expect(intent("j", { target: elementTarget("input") })).toBeUndefined();
    expect(intent("ArrowLeft", { target: elementTarget("textarea") })).toBeUndefined();
    expect(intent("k", { target: elementTarget("div", "textbox") })).toBeUndefined();
    expect(intent("l", { target: elementTarget("div", undefined, true) })).toBeUndefined();
  });

  it("detects editable ancestors", () => {
    const target = elementTarget("span", undefined, false, true);

    expect(isTextEditingTarget(target)).toBe(true);
  });
});

function intent(
  key: string,
  options: Partial<
    Pick<KeyboardEvent, "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "target">
  > = {}
) {
  return directionalIntentFromKeydown({
    key,
    altKey: options.altKey ?? false,
    ctrlKey: options.ctrlKey ?? false,
    metaKey: options.metaKey ?? false,
    shiftKey: options.shiftKey ?? false,
    target: options.target ?? null,
  } as KeyboardEvent);
}

function elementTarget(
  nodeName: string,
  role?: string,
  isContentEditable = false,
  hasEditableAncestor = false
): EventTarget {
  return {
    nodeName,
    isContentEditable,
    getAttribute: (name: string) => (name === "role" ? (role ?? null) : null),
    closest: (selector: string) => {
      if (
        hasEditableAncestor &&
        (selector === '[contenteditable="true"]' ||
          selector === '[role="textbox"]' ||
          selector === '[role="combobox"]')
      ) {
        return {} as Element;
      }
      return null;
    },
  } as unknown as EventTarget;
}
