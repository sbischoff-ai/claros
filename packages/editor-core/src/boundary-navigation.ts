import { Prec, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { getCM } from "@replit/codemirror-vim";

export type MarkdownBoundaryNavigationDirection = "up" | "down";

export interface MarkdownBoundaryNavigationOptions {
  onNavigate(direction: MarkdownBoundaryNavigationDirection): boolean;
  timeoutMs?: number;
}

interface PendingBoundaryNavigation {
  direction: MarkdownBoundaryNavigationDirection;
  timestamp: number;
}

const DEFAULT_BOUNDARY_NAVIGATION_TIMEOUT_MS = 500;

export function markdownBoundaryNavigationExtension(
  options: MarkdownBoundaryNavigationOptions
): Extension {
  const timeoutMs = options.timeoutMs ?? DEFAULT_BOUNDARY_NAVIGATION_TIMEOUT_MS;
  let pending: PendingBoundaryNavigation | undefined;

  return Prec.highest(
    EditorView.domEventHandlers({
      blur() {
        pending = undefined;
        return false;
      },
      mousedown() {
        pending = undefined;
        return false;
      },
      keydown(event, view) {
        if (event.repeat || hasModifier(event)) {
          pending = undefined;
          return false;
        }

        const direction = navigationDirection(event, view);
        if (direction === undefined || !cursorIsAtBoundary(view, direction)) {
          pending = undefined;
          return false;
        }

        const timestamp = Date.now();
        if (pending?.direction === direction && timestamp - pending.timestamp <= timeoutMs) {
          pending = undefined;
          return options.onNavigate(direction);
        }

        pending = { direction, timestamp };
        return false;
      },
    })
  );
}

function navigationDirection(
  event: KeyboardEvent,
  view: EditorView
): MarkdownBoundaryNavigationDirection | undefined {
  if (event.key === "ArrowUp") {
    return "up";
  }
  if (event.key === "ArrowDown") {
    return "down";
  }
  if (event.key !== "k" && event.key !== "j") {
    return undefined;
  }

  const vimState = getCM(view)?.state.vim;
  if (vimState === undefined || vimState === null || vimState.insertMode || vimState.visualMode) {
    return undefined;
  }
  return event.key === "k" ? "up" : "down";
}

function cursorIsAtBoundary(
  view: EditorView,
  direction: MarkdownBoundaryNavigationDirection
): boolean {
  const selection = view.state.selection.main;
  if (!selection.empty) {
    return false;
  }

  const line = view.state.doc.lineAt(selection.head);
  return direction === "up" ? line.number === 1 : line.number === view.state.doc.lines;
}

function hasModifier(event: KeyboardEvent): boolean {
  return event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
}
