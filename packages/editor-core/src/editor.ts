import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { bracketMatching } from "@codemirror/language";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightSpecialChars,
  keymap,
} from "@codemirror/view";
import { vim } from "@replit/codemirror-vim";

import { markdownMarkerDecorations } from "./markdown-markers";
import { markdownPresentationDecorations } from "./markdown-presentation";
import {
  DEFAULT_CLAROS_THEME_ID,
  applyNamedTheme,
  applyThemeTokens,
  createClarosEditorTheme,
  type ClarosThemeId,
  type ClarosThemeTokens,
} from "./theme";

export const defaultMarkdown = `# The Abandoned Temple

Rain whispered through the broken arch.

Kareth paused at the threshold, one hand on the old iron latch. Somewhere beyond the nave, stone shifted against stone.

He thought of [[The Priest]] and the warning she had refused to explain.
`;

export interface MarkdownEditorOptions {
  parent: HTMLElement;
  doc?: string;
  vimMode?: boolean;
  theme?: ClarosThemeId | Partial<ClarosThemeTokens>;
  onChange?: (markdown: string) => void;
}

export type MarkdownEditorCursor = "start" | "end" | number;

export interface MarkdownEditorFocusOptions {
  cursor?: MarkdownEditorCursor;
}

export interface MarkdownEditorSetMarkdownOptions {
  cursor?: MarkdownEditorCursor;
}

export interface ClarosMarkdownEditor {
  focus(options?: MarkdownEditorFocusOptions): void;
  getCursorPosition(): number;
  getMarkdown(): string;
  setMarkdown(markdown: string, options?: MarkdownEditorSetMarkdownOptions): void;
  setVimMode(enabled: boolean): void;
  setTheme(theme: ClarosThemeId | Partial<ClarosThemeTokens>): void;
  destroy(): void;
}

export function createMarkdownEditor(options: MarkdownEditorOptions): ClarosMarkdownEditor {
  applyEditorTheme(options.parent, options.theme ?? DEFAULT_CLAROS_THEME_ID);

  const vimCompartment = new Compartment();
  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      options.onChange?.(update.state.doc.toString());
    }
  });

  const view = new EditorView({
    parent: options.parent,
    state: EditorState.create({
      doc: options.doc ?? defaultMarkdown,
      extensions: [
        vimCompartment.of(options.vimMode ? vim() : []),
        ...baseExtensions(),
        updateListener,
      ],
    }),
  });

  return {
    focus(focusOptions?: MarkdownEditorFocusOptions): void {
      const cursor = focusOptions?.cursor;
      if (cursor !== undefined) {
        view.dispatch({
          selection: { anchor: resolveMarkdownCursorPosition(view.state.doc.length, cursor) },
        });
      }
      view.focus();
    },
    getCursorPosition(): number {
      return view.state.selection.main.head;
    },
    getMarkdown(): string {
      return view.state.doc.toString();
    },
    setMarkdown(markdownText: string, setOptions?: MarkdownEditorSetMarkdownOptions): void {
      const cursor =
        setOptions?.cursor === undefined
          ? undefined
          : resolveMarkdownCursorPosition(markdownText.length, setOptions.cursor);
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: markdownText,
        },
        selection: cursor === undefined ? undefined : { anchor: cursor },
      });
    },
    setVimMode(enabled: boolean): void {
      view.dispatch({
        effects: vimCompartment.reconfigure(enabled ? vim() : []),
      });
    },
    setTheme(theme: ClarosThemeId | Partial<ClarosThemeTokens>): void {
      applyEditorTheme(options.parent, theme);
    },
    destroy(): void {
      view.destroy();
    },
  };
}

export function resolveMarkdownCursorPosition(
  documentLength: number,
  cursor: MarkdownEditorCursor
): number {
  if (cursor === "start") {
    return 0;
  }
  if (cursor === "end") {
    return documentLength;
  }
  return Math.min(Math.max(Math.trunc(cursor), 0), documentLength);
}

function baseExtensions(): Extension[] {
  return [
    highlightSpecialChars(),
    history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    markdown(),
    bracketMatching(),
    highlightSelectionMatches(),
    EditorView.lineWrapping,
    createClarosEditorTheme(),
    markdownPresentationDecorations,
    markdownMarkerDecorations,
    keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap, ...searchKeymap]),
  ];
}

function applyEditorTheme(
  parent: HTMLElement,
  theme: ClarosThemeId | Partial<ClarosThemeTokens>
): void {
  if (typeof theme === "string") {
    applyNamedTheme(parent, theme);
    return;
  }

  parent.setAttribute("data-claros-theme", "custom");
  applyThemeTokens(parent, theme);
}
