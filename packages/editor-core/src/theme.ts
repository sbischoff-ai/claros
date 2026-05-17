import { EditorView } from "@codemirror/view";

export const CLAROS_THEME_ATTRIBUTE = "data-claros-theme";

export interface ClarosThemeTokens {
  appBackground: string;
  editorBackground: string;
  proseText: string;
  proseMuted: string;
  proseHeading: string;
  proseLink: string;
  proseSelection: string;
  proseCursor: string;
  proseFocusRing: string;
  proseMarker: string;
  proseWidgetBackground: string;
  proseWidgetBorder: string;
  proseFont: string;
  proseMonoFont: string;
  proseFontSize: string;
  proseLineHeight: string;
  proseColumnWidth: string;
}

export const DEFAULT_CLAROS_THEME: ClarosThemeTokens = {
  appBackground: "#f7f5f0",
  editorBackground: "#fffdf8",
  proseText: "#27241f",
  proseMuted: "#7a746b",
  proseHeading: "#1f2722",
  proseLink: "#465f7c",
  proseSelection: "rgba(116, 139, 117, 0.24)",
  proseCursor: "#27241f",
  proseFocusRing: "rgba(70, 95, 124, 0.26)",
  proseMarker: "rgba(39, 36, 31, 0.18)",
  proseWidgetBackground: "#f0ede5",
  proseWidgetBorder: "#d8d1c4",
  proseFont: "Iowan Old Style, Palatino Linotype, Palatino, Charter, Georgia, serif",
  proseMonoFont:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  proseFontSize: "20px",
  proseLineHeight: "1.72",
  proseColumnWidth: "760px",
};

const tokenNames: Record<keyof ClarosThemeTokens, string> = {
  appBackground: "--claros-app-background",
  editorBackground: "--claros-editor-background",
  proseText: "--claros-prose-text",
  proseMuted: "--claros-prose-muted",
  proseHeading: "--claros-prose-heading",
  proseLink: "--claros-prose-link",
  proseSelection: "--claros-prose-selection",
  proseCursor: "--claros-prose-cursor",
  proseFocusRing: "--claros-prose-focus-ring",
  proseMarker: "--claros-prose-marker",
  proseWidgetBackground: "--claros-prose-widget-background",
  proseWidgetBorder: "--claros-prose-widget-border",
  proseFont: "--claros-prose-font",
  proseMonoFont: "--claros-prose-mono-font",
  proseFontSize: "--claros-prose-font-size",
  proseLineHeight: "--claros-prose-line-height",
  proseColumnWidth: "--claros-prose-column-width",
};

export function buildThemeStyleProperties(
  tokens: Partial<ClarosThemeTokens> = {}
): Record<string, string> {
  const merged = { ...DEFAULT_CLAROS_THEME, ...tokens };
  return Object.fromEntries(
    Object.entries(tokenNames).map(([tokenName, cssName]) => [
      cssName,
      merged[tokenName as keyof ClarosThemeTokens],
    ])
  );
}

export function applyThemeTokens(
  element: HTMLElement,
  tokens: Partial<ClarosThemeTokens> = {}
): void {
  for (const [property, value] of Object.entries(buildThemeStyleProperties(tokens))) {
    element.style.setProperty(property, value);
  }
}

export function createClarosEditorTheme() {
  return EditorView.theme({
    "&": {
      backgroundColor: "var(--claros-editor-background)",
      color: "var(--claros-prose-text)",
      fontFamily: "var(--claros-prose-font)",
      fontSize: "var(--claros-prose-font-size)",
      lineHeight: "var(--claros-prose-line-height)",
      minHeight: "100%",
      outline: "none",
    },
    "&.cm-focused": {
      outline: "none",
    },
    ".cm-scroller": {
      fontFamily: "inherit",
      lineHeight: "inherit",
      overflow: "auto",
    },
    ".cm-content": {
      boxSizing: "border-box",
      caretColor: "var(--claros-prose-cursor)",
      margin: "0 auto",
      maxWidth: "var(--claros-prose-column-width)",
      minHeight: "100%",
      padding: "12vh 2rem 18vh",
      whiteSpace: "pre-wrap",
      wordBreak: "normal",
    },
    ".cm-line": {
      padding: "0",
    },
    ".cm-gutters": {
      display: "none",
    },
    ".cm-activeLine": {
      backgroundColor: "transparent",
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "var(--claros-prose-selection)",
    },
    ".cm-cursor": {
      borderLeftColor: "var(--claros-prose-cursor)",
    },
    ".cm-claros-markdown-marker": {
      color: "var(--claros-prose-marker)",
      fontFamily: "var(--claros-prose-mono-font)",
    },
    ".cm-claros-heading-marker": {
      color: "var(--claros-prose-marker)",
    },
    ".cm-matchingBracket, .cm-nonmatchingBracket": {
      backgroundColor: "transparent",
      color: "inherit",
      outline: "1px solid var(--claros-prose-focus-ring)",
    },
  });
}
