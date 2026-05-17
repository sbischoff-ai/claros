import { markdownLanguage } from "@codemirror/lang-markdown";
import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";

type MarkdownTree = ReturnType<(typeof markdownLanguage.parser)["parse"]>;
type MarkdownSyntaxNode = ReturnType<MarkdownTree["cursor"]>["node"];

export type MarkdownPresentationKind =
  | "heading1"
  | "heading2"
  | "heading3"
  | "heading4"
  | "heading5"
  | "heading6"
  | "emphasis"
  | "strong";

export interface MarkdownPresentationRange {
  from: number;
  to: number;
  kind: MarkdownPresentationKind;
}

interface PresentationDecoration {
  from: number;
  to: number;
  decoration: Decoration;
}

const emphasisDecoration = Decoration.mark({ class: "cm-claros-emphasis" });
const strongDecoration = Decoration.mark({ class: "cm-claros-strong" });

const headingDecorations: Record<
  Exclude<MarkdownPresentationKind, "emphasis" | "strong">,
  Decoration
> = {
  heading1: Decoration.line({ class: "cm-claros-heading-line cm-claros-heading-line-h1" }),
  heading2: Decoration.line({ class: "cm-claros-heading-line cm-claros-heading-line-h2" }),
  heading3: Decoration.line({ class: "cm-claros-heading-line cm-claros-heading-line-h3" }),
  heading4: Decoration.line({ class: "cm-claros-heading-line cm-claros-heading-line-h4" }),
  heading5: Decoration.line({ class: "cm-claros-heading-line cm-claros-heading-line-h5" }),
  heading6: Decoration.line({ class: "cm-claros-heading-line cm-claros-heading-line-h6" }),
};

const headingNodeNames: Record<string, MarkdownPresentationKind> = {
  ATXHeading1: "heading1",
  SetextHeading1: "heading1",
  ATXHeading2: "heading2",
  SetextHeading2: "heading2",
  ATXHeading3: "heading3",
  ATXHeading4: "heading4",
  ATXHeading5: "heading5",
  ATXHeading6: "heading6",
};

export function findMarkdownPresentationRanges(markdown: string): MarkdownPresentationRange[] {
  return collectPresentationRanges(markdownLanguage.parser.parse(markdown));
}

function collectPresentationRanges(tree: MarkdownTree): MarkdownPresentationRange[] {
  const ranges: MarkdownPresentationRange[] = [];
  const cursor = tree.cursor();

  do {
    const kind = presentationKindForNode(cursor.name);
    if (!kind || cursor.from === cursor.to) {
      continue;
    }

    if (kind === "emphasis" || kind === "strong") {
      for (const textRange of rangesExcludingMarkup(cursor.node, "EmphasisMark")) {
        ranges.push({ ...textRange, kind });
      }
      continue;
    }

    ranges.push({
      from: cursor.from,
      to: cursor.to,
      kind,
    });
  } while (cursor.next());

  return ranges.sort((a, b) => a.from - b.from || a.to - b.to);
}

function presentationKindForNode(name: string): MarkdownPresentationKind | undefined {
  if (name === "Emphasis") {
    return "emphasis";
  }

  if (name === "StrongEmphasis") {
    return "strong";
  }

  return headingNodeNames[name];
}

function rangesExcludingMarkup(
  node: MarkdownSyntaxNode,
  markupNodeName: string
): Array<{ from: number; to: number }> {
  const markupRanges: Array<{ from: number; to: number }> = [];
  collectMarkupRanges(node.firstChild, markupNodeName, markupRanges);

  const ranges: Array<{ from: number; to: number }> = [];
  let from = node.from;

  for (const markupRange of markupRanges.sort((a, b) => a.from - b.from)) {
    if (from < markupRange.from) {
      ranges.push({ from, to: markupRange.from });
    }
    from = Math.max(from, markupRange.to);
  }

  if (from < node.to) {
    ranges.push({ from, to: node.to });
  }

  return ranges.filter((range) => range.from < range.to);
}

function collectMarkupRanges(
  node: MarkdownSyntaxNode | null,
  markupNodeName: string,
  ranges: Array<{ from: number; to: number }>
): void {
  let currentNode = node;
  while (currentNode) {
    if (currentNode.name === markupNodeName) {
      ranges.push({ from: currentNode.from, to: currentNode.to });
    } else {
      collectMarkupRanges(currentNode.firstChild, markupNodeName, ranges);
    }
    currentNode = currentNode.nextSibling;
  }
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const decorations: PresentationDecoration[] = [];

  for (const range of collectPresentationRanges(syntaxTree(view.state))) {
    if (range.kind === "emphasis") {
      decorations.push({ ...range, decoration: emphasisDecoration });
      continue;
    }

    if (range.kind === "strong") {
      decorations.push({ ...range, decoration: strongDecoration });
      continue;
    }

    decorations.push({
      from: view.state.doc.lineAt(range.from).from,
      to: view.state.doc.lineAt(range.from).from,
      decoration: headingDecorations[range.kind],
    });
  }

  decorations
    .sort((a, b) => a.from - b.from || a.to - b.to)
    .forEach((range) => builder.add(range.from, range.to, range.decoration));

  return builder.finish();
}

export const markdownPresentationDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate): void {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
  }
);
