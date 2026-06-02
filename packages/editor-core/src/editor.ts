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

import { markdownAutoPairExtension } from "./markdown-autopairs";
import { markdownMarkerDecorations } from "./markdown-markers";
import { markdownPresentationDecorations } from "./markdown-presentation";
import { markdownWikilinkExtension, type MarkdownWikilinkOptions } from "./markdown-wikilinks";
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
  documentId?: string;
  vimMode?: boolean;
  theme?: ClarosThemeId | Partial<ClarosThemeTokens>;
  wikilinks?: MarkdownWikilinkOptions;
  onChange?: (markdown: string) => void;
}

export type MarkdownEditorCursor = "start" | "end" | number;

export interface MarkdownEditorFocusOptions {
  cursor?: MarkdownEditorCursor;
}

export interface MarkdownEditorSetMarkdownOptions {
  cursor?: MarkdownEditorCursor;
  documentId?: string;
}

export interface ClarosMarkdownEditor {
  focus(options?: MarkdownEditorFocusOptions): void;
  getCursorPosition(): number;
  getMarkdown(): string;
  scrollSelectionIntoView(): void;
  setMarkdown(markdown: string, options?: MarkdownEditorSetMarkdownOptions): void;
  setVimMode(enabled: boolean): void;
  setTheme(theme: ClarosThemeId | Partial<ClarosThemeTokens>): void;
  destroy(): void;
}

export class MarkdownDocumentStateStore {
  private activeDocumentId: string;
  private readonly states = new Map<string, EditorState>();

  constructor(documentId: string, state: EditorState) {
    this.activeDocumentId = documentId;
    this.states.set(documentId, state);
  }

  get activeId(): string {
    return this.activeDocumentId;
  }

  setActiveState(state: EditorState): void {
    this.states.set(this.activeDocumentId, state);
  }

  loadDocument(
    documentId: string,
    markdown: string,
    createState: (markdownText: string) => EditorState
  ): EditorState {
    this.activeDocumentId = documentId;

    const storedState = this.states.get(documentId);
    if (storedState?.doc.toString() === markdown) {
      return storedState;
    }

    const state = createState(markdown);
    this.states.set(documentId, state);
    return state;
  }
}

export function createMarkdownEditor(options: MarkdownEditorOptions): ClarosMarkdownEditor {
  applyEditorTheme(options.parent, options.theme ?? DEFAULT_CLAROS_THEME_ID);

  const vimCompartment = new Compartment();
  let vimMode = options.vimMode === true;
  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      options.onChange?.(update.state.doc.toString());
    }
  });
  const initialDocumentId = options.documentId ?? "";

  const createState = (
    markdownText: string,
    stateOptions?: { cursor?: MarkdownEditorCursor }
  ): EditorState => {
    const cursor =
      stateOptions?.cursor === undefined
        ? undefined
        : resolveMarkdownCursorPosition(markdownText.length, stateOptions.cursor);
    return EditorState.create({
      doc: markdownText,
      selection: cursor === undefined ? undefined : { anchor: cursor },
      extensions: [
        vimCompartment.of(vimMode ? vim() : []),
        ...baseExtensions(options.wikilinks),
        updateListener,
      ],
    });
  };

  const view = new EditorView({
    parent: options.parent,
    state: createState(options.doc ?? defaultMarkdown),
  });
  const documentStateStore = new MarkdownDocumentStateStore(initialDocumentId, view.state);

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
    scrollSelectionIntoView(): void {
      view.dispatch({
        effects: EditorView.scrollIntoView(view.state.selection.main, { y: "nearest" }),
      });
    },
    setMarkdown(markdownText: string, setOptions?: MarkdownEditorSetMarkdownOptions): void {
      documentStateStore.setActiveState(view.state);
      const state = documentStateStore.loadDocument(
        setOptions?.documentId ?? documentStateStore.activeId,
        markdownText,
        (text) => createState(text, { cursor: setOptions?.cursor })
      );
      view.setState(state);
      if (setOptions?.cursor !== undefined) {
        view.dispatch({
          selection: {
            anchor: resolveMarkdownCursorPosition(markdownText.length, setOptions.cursor),
          },
        });
      }
      view.dispatch({ effects: vimCompartment.reconfigure(vimMode ? vim() : []) });
      documentStateStore.setActiveState(view.state);
    },
    setVimMode(enabled: boolean): void {
      vimMode = enabled;
      view.dispatch({
        effects: vimCompartment.reconfigure(vimMode ? vim() : []),
      });
      documentStateStore.setActiveState(view.state);
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

function baseExtensions(wikilinks?: MarkdownWikilinkOptions): Extension[] {
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
    ...(wikilinks === undefined ? [] : markdownWikilinkExtension(wikilinks)),
    markdownMarkerDecorations,
    markdownAutoPairExtension(),
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
