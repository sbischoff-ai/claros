import { insertNewlineAndIndent } from "@codemirror/commands";
import { insertNewlineContinueMarkup } from "@codemirror/lang-markdown";
import { Prec, type Extension } from "@codemirror/state";
import { keymap, type EditorView } from "@codemirror/view";

export function markdownProseEditingExtension(): Extension {
  return Prec.highest(
    keymap.of([
      { key: "Enter", run: insertParagraphBreak },
      { key: "Shift-Enter", run: insertContinuedLine },
    ])
  );
}

function insertParagraphBreak(view: EditorView): boolean {
  const { state } = view;
  if (state.readOnly) {
    return false;
  }

  const selection = state.selection.main;
  if (selection.empty) {
    const line = state.doc.lineAt(selection.head);
    if (isWhitespaceOnly(line.text) || isMarkdownMarkupOnly(line.text)) {
      view.dispatch(
        state.update({
          changes: { from: line.from, to: line.to, insert: "\n" },
          selection: { anchor: line.from + 1 },
          scrollIntoView: true,
          userEvent: "input",
        })
      );
      return true;
    }
  }

  view.dispatch(
    state.update(state.replaceSelection("\n\n"), {
      scrollIntoView: true,
      userEvent: "input",
    })
  );
  return true;
}

function insertContinuedLine(view: EditorView): boolean {
  return insertNewlineContinueMarkup(view) || insertNewlineAndIndent(view);
}

function isWhitespaceOnly(line: string): boolean {
  return line.trim().length === 0;
}

function isMarkdownMarkupOnly(line: string): boolean {
  return /^\s*(?:>\s*)*(?:(?:[-+*]|\d+[.)])\s*)?$/.test(line) && /[>\-+*.)]/.test(line);
}
