export type DirectionalIntent = "up" | "down" | "left" | "right" | "activate";

export function directionalIntentFromKeydown(event: KeyboardEvent): DirectionalIntent | undefined {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return undefined;
  }
  if (isTextEditingTarget(event.target)) {
    return undefined;
  }

  switch (event.key) {
    case "ArrowUp":
    case "k":
      return "up";
    case "ArrowDown":
    case "j":
      return "down";
    case "ArrowLeft":
    case "h":
      return "left";
    case "ArrowRight":
    case "l":
      return "right";
    case "Enter":
      return "activate";
    default:
      return undefined;
  }
}

export function isTextEditingTarget(target: EventTarget | null): boolean {
  if (target === null || !isElementLike(target)) {
    return false;
  }

  const nodeName = target.nodeName.toLowerCase();
  if (nodeName === "input" || nodeName === "textarea" || nodeName === "select") {
    return true;
  }

  if (target.isContentEditable === true) {
    return true;
  }

  const role = target.getAttribute("role");
  if (role === "textbox" || role === "combobox") {
    return true;
  }

  return (
    target.closest('[contenteditable="true"]') !== null ||
    target.closest('[role="textbox"]') !== null ||
    target.closest('[role="combobox"]') !== null
  );
}

interface ElementLike extends EventTarget {
  nodeName: string;
  isContentEditable?: boolean;
  getAttribute(name: string): string | null;
  closest(selector: string): Element | null;
}

function isElementLike(target: EventTarget): target is ElementLike {
  const candidate = target as Partial<ElementLike>;
  return (
    typeof candidate.nodeName === "string" &&
    typeof candidate.getAttribute === "function" &&
    typeof candidate.closest === "function"
  );
}
