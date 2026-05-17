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
import { applyThemeTokens, createClarosEditorTheme, type ClarosThemeTokens } from "./theme";

export const defaultMarkdown = `# The Abandoned Temple

Rain whispered through the broken arch.

Kareth paused at the threshold, one hand on the old iron latch. Somewhere beyond the nave, stone shifted against stone.

He thought of [[The Priest]] and the warning she had refused to explain.
`;

export interface MarkdownEditorOptions {
  parent: HTMLElement;
  doc?: string;
  vimMode?: boolean;
  theme?: Partial<ClarosThemeTokens>;
  onChange?: (markdown: string) => void;
}

export interface ClarosMarkdownEditor {
  focus(): void;
  getMarkdown(): string;
  setMarkdown(markdown: string): void;
  setVimMode(enabled: boolean): void;
  setTheme(theme: Partial<ClarosThemeTokens>): void;
  destroy(): void;
}

export function createMarkdownEditor(options: MarkdownEditorOptions): ClarosMarkdownEditor {
  options.parent.setAttribute("data-claros-theme", "default");
  applyThemeTokens(options.parent, options.theme);

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
    focus(): void {
      view.focus();
    },
    getMarkdown(): string {
      return view.state.doc.toString();
    },
    setMarkdown(markdownText: string): void {
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: markdownText,
        },
      });
    },
    setVimMode(enabled: boolean): void {
      view.dispatch({
        effects: vimCompartment.reconfigure(enabled ? vim() : []),
      });
    },
    setTheme(theme: Partial<ClarosThemeTokens>): void {
      applyThemeTokens(options.parent, theme);
    },
    destroy(): void {
      view.destroy();
    },
  };
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
    markdownMarkerDecorations,
    keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap, ...searchKeymap]),
  ];
}
