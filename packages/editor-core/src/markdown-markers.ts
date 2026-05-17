import { RangeSetBuilder, type SelectionRange } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";

export interface MarkdownMarkerRange {
  from: number;
  to: number;
  kind: "heading" | "emphasis" | "code" | "link";
}

const markerDecoration = Decoration.mark({
  class: "cm-claros-markdown-marker",
});

const headingMarkerDecoration = Decoration.mark({
  class: "cm-claros-markdown-marker cm-claros-heading-marker",
});

export function findMarkdownMarkerRanges(
  markdown: string,
  selectionRanges: readonly Pick<SelectionRange, "from" | "to">[] = []
): MarkdownMarkerRange[] {
  const ranges: MarkdownMarkerRange[] = [];
  let lineStart = 0;

  for (const line of markdown.split("\n")) {
    const lineEnd = lineStart + line.length;
    if (!selectionIntersectsLine(selectionRanges, lineStart, lineEnd)) {
      collectLineMarkers(line, lineStart, ranges);
    }
    lineStart = lineEnd + 1;
  }

  return ranges;
}

function selectionIntersectsLine(
  selectionRanges: readonly Pick<SelectionRange, "from" | "to">[],
  lineStart: number,
  lineEnd: number
): boolean {
  return selectionRanges.some((range) => {
    const from = Math.min(range.from, range.to);
    const to = Math.max(range.from, range.to);
    return from <= lineEnd && to >= lineStart;
  });
}

function collectLineMarkers(line: string, lineStart: number, ranges: MarkdownMarkerRange[]): void {
  const heading = /^(#{1,6})(\s+)/.exec(line);
  if (heading) {
    ranges.push({
      from: lineStart,
      to: lineStart + heading[0].length,
      kind: "heading",
    });
  }

  collectMatches(line, lineStart, /`+/g, "code", ranges);
  collectMatches(line, lineStart, /\*\*|\*|__|_/g, "emphasis", ranges);
  collectMatches(line, lineStart, /\[\[|\]\]|\]\(|\[|\]|\)|\|/g, "link", ranges);
}

function collectMatches(
  line: string,
  lineStart: number,
  pattern: RegExp,
  kind: MarkdownMarkerRange["kind"],
  ranges: MarkdownMarkerRange[]
): void {
  for (const match of line.matchAll(pattern)) {
    if (match.index === undefined) {
      continue;
    }
    ranges.push({
      from: lineStart + match.index,
      to: lineStart + match.index + match[0].length,
      kind,
    });
  }
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const ranges = findMarkdownMarkerRanges(
    view.state.doc.toString(),
    view.state.selection.ranges
  ).sort((a, b) => a.from - b.from || a.to - b.to);

  let lastTo = -1;
  for (const range of ranges) {
    if (range.from < lastTo || range.from === range.to) {
      continue;
    }
    builder.add(
      range.from,
      range.to,
      range.kind === "heading" ? headingMarkerDecoration : markerDecoration
    );
    lastTo = range.to;
  }

  return builder.finish();
}

export const markdownMarkerDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate): void {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
  }
);
