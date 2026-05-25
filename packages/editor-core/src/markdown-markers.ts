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

  collectPairedMarkers(line, lineStart, /(`+)([^`]+)(\1)/g, "code", ranges);
  collectPairedMarkers(line, lineStart, /(\*\*|__)(?=\S)(.+?\S)\1/g, "emphasis", ranges);
  collectPairedMarkers(
    line,
    lineStart,
    /(?<!\*)(\*)(?!\*)(?=\S)([^*\n]*?\S)(?<!\*)\*(?!\*)/g,
    "emphasis",
    ranges
  );
  collectPairedMarkers(
    line,
    lineStart,
    /(?<!_)(_)(?!_)(?=\S)([^_\n]*?\S)(?<!_)_(?!_)/g,
    "emphasis",
    ranges
  );
  collectPairedMarkers(line, lineStart, /(\[\[)([^\]\n]+)(\]\])/g, "link", ranges);
  collectPairedMarkers(line, lineStart, /(\[[^\]\n]+\])(\([^\)\n]+\))/g, "link", ranges);
}

function collectPairedMarkers(
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
    if (kind === "link" && match[0].startsWith("[")) {
      collectLinkMarkers(lineStart, match, ranges);
      continue;
    }
    const open = match[1] ?? match[0][0];
    const close = match[3] ?? open;
    ranges.push({ from: lineStart + match.index, to: lineStart + match.index + open.length, kind });
    ranges.push({
      from: lineStart + match.index + match[0].length - close.length,
      to: lineStart + match.index + match[0].length,
      kind,
    });
  }
}

function collectLinkMarkers(
  lineStart: number,
  match: RegExpMatchArray,
  ranges: MarkdownMarkerRange[]
): void {
  if (match.index === undefined) {
    return;
  }
  const raw = match[0];
  if (raw.startsWith("[[")) {
    ranges.push({ from: lineStart + match.index, to: lineStart + match.index + 2, kind: "link" });
    const pipe = raw.indexOf("|");
    if (pipe !== -1) {
      ranges.push({
        from: lineStart + match.index + pipe,
        to: lineStart + match.index + pipe + 1,
        kind: "link",
      });
    }
    ranges.push({
      from: lineStart + match.index + raw.length - 2,
      to: lineStart + match.index + raw.length,
      kind: "link",
    });
    return;
  }

  const closeBracket = raw.indexOf("]");
  const openParen = raw.indexOf("(", closeBracket);
  ranges.push({ from: lineStart + match.index, to: lineStart + match.index + 1, kind: "link" });
  ranges.push({
    from: lineStart + match.index + closeBracket,
    to: lineStart + match.index + closeBracket + 1,
    kind: "link",
  });
  ranges.push({
    from: lineStart + match.index + openParen,
    to: lineStart + match.index + openParen + 1,
    kind: "link",
  });
  ranges.push({
    from: lineStart + match.index + raw.length - 1,
    to: lineStart + match.index + raw.length,
    kind: "link",
  });
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
