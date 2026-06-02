import { EditorView } from "@codemirror/view";

export const CLAROS_THEME_ATTRIBUTE = "data-claros-theme";

export type ClarosThemeId =
  | "default-light"
  | "default-dark"
  | "gruvbox-light"
  | "gruvbox-dark"
  | "solarized-light"
  | "solarized-dark"
  | "everforest-light"
  | "everforest-dark"
  | "catppuccin-light"
  | "catppuccin-dark";

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
  statusOkay: string;
  statusWarning: string;
  statusError: string;
  proseFont: string;
  proseMonoFont: string;
  proseFontSize: string;
  proseLineHeight: string;
  proseColumnWidth: string;
}

export interface ClarosThemeDefinition {
  id: ClarosThemeId;
  label: string;
  family: string;
  mode: "light" | "dark";
  tokens: ClarosThemeTokens;
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
  statusOkay: "#4f7d4f",
  statusWarning: "#b7791f",
  statusError: "#9d3d3d",
  proseFont: "Iowan Old Style, Palatino Linotype, Palatino, Charter, Georgia, serif",
  proseMonoFont:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  proseFontSize: "20px",
  proseLineHeight: "1.72",
  proseColumnWidth: "760px",
};

const DEFAULT_DARK_CLAROS_THEME: ClarosThemeTokens = {
  ...DEFAULT_CLAROS_THEME,
  appBackground: "#191715",
  editorBackground: "#211f1b",
  proseText: "#e7dfd1",
  proseMuted: "#aaa092",
  proseHeading: "#f1e8d8",
  proseLink: "#a9bdce",
  proseSelection: "rgba(169, 189, 206, 0.24)",
  proseCursor: "#efe6d6",
  proseFocusRing: "rgba(169, 189, 206, 0.28)",
  proseMarker: "rgba(231, 223, 209, 0.24)",
  proseWidgetBackground: "#29261f",
  proseWidgetBorder: "#4c4539",
  statusOkay: "#8fbf83",
  statusWarning: "#d6a64f",
  statusError: "#d47777",
};

function theme(
  id: ClarosThemeId,
  label: string,
  family: string,
  mode: "light" | "dark",
  tokens: ClarosThemeTokens
): ClarosThemeDefinition {
  return { id, label, family, mode, tokens };
}

export const CLAROS_THEMES: readonly ClarosThemeDefinition[] = [
  theme("default-light", "Default Light", "Default", "light", DEFAULT_CLAROS_THEME),
  theme("default-dark", "Default Dark", "Default", "dark", DEFAULT_DARK_CLAROS_THEME),
  theme("gruvbox-light", "Gruvbox Light", "Gruvbox", "light", {
    ...DEFAULT_CLAROS_THEME,
    appBackground: "#f2e5bc",
    editorBackground: "#fbf1c7",
    proseText: "#3c3836",
    proseMuted: "#7c6f64",
    proseHeading: "#504945",
    proseLink: "#427b58",
    proseSelection: "rgba(104, 157, 106, 0.24)",
    proseCursor: "#3c3836",
    proseFocusRing: "rgba(66, 123, 88, 0.26)",
    proseMarker: "rgba(60, 56, 54, 0.23)",
    proseWidgetBackground: "#ebdbb2",
    proseWidgetBorder: "#d5c4a1",
    statusOkay: "#79740e",
    statusWarning: "#b57614",
    statusError: "#9d0006",
  }),
  theme("gruvbox-dark", "Gruvbox Dark", "Gruvbox", "dark", {
    ...DEFAULT_CLAROS_THEME,
    appBackground: "#1d2021",
    editorBackground: "#282828",
    proseText: "#d5c4a1",
    proseMuted: "#a89984",
    proseHeading: "#ebdbb2",
    proseLink: "#8ec07c",
    proseSelection: "rgba(142, 192, 124, 0.22)",
    proseCursor: "#ebdbb2",
    proseFocusRing: "rgba(142, 192, 124, 0.28)",
    proseMarker: "rgba(213, 196, 161, 0.24)",
    proseWidgetBackground: "#32302f",
    proseWidgetBorder: "#504945",
    statusOkay: "#b8bb26",
    statusWarning: "#fabd2f",
    statusError: "#fb4934",
  }),
  theme("solarized-light", "Solarized Light", "Solarized", "light", {
    ...DEFAULT_CLAROS_THEME,
    appBackground: "#eee8d5",
    editorBackground: "#fdf6e3",
    proseText: "#586e75",
    proseMuted: "#839496",
    proseHeading: "#073642",
    proseLink: "#268bd2",
    proseSelection: "rgba(38, 139, 210, 0.2)",
    proseCursor: "#586e75",
    proseFocusRing: "rgba(38, 139, 210, 0.28)",
    proseMarker: "rgba(88, 110, 117, 0.24)",
    proseWidgetBackground: "#eee8d5",
    proseWidgetBorder: "#d8cfb5",
    statusOkay: "#859900",
    statusWarning: "#b58900",
    statusError: "#dc322f",
  }),
  theme("solarized-dark", "Solarized Dark", "Solarized", "dark", {
    ...DEFAULT_CLAROS_THEME,
    appBackground: "#00212b",
    editorBackground: "#002b36",
    proseText: "#93a1a1",
    proseMuted: "#657b83",
    proseHeading: "#eee8d5",
    proseLink: "#6c9ec6",
    proseSelection: "rgba(42, 161, 152, 0.2)",
    proseCursor: "#eee8d5",
    proseFocusRing: "rgba(42, 161, 152, 0.28)",
    proseMarker: "rgba(147, 161, 161, 0.26)",
    proseWidgetBackground: "#073642",
    proseWidgetBorder: "#164b56",
    statusOkay: "#859900",
    statusWarning: "#b58900",
    statusError: "#dc322f",
  }),
  theme("everforest-light", "Everforest Light", "Everforest", "light", {
    ...DEFAULT_CLAROS_THEME,
    appBackground: "#efebd4",
    editorBackground: "#fdf6e3",
    proseText: "#5c6a72",
    proseMuted: "#829181",
    proseHeading: "#3a4a4f",
    proseLink: "#3a7f6f",
    proseSelection: "rgba(137, 161, 115, 0.24)",
    proseCursor: "#5c6a72",
    proseFocusRing: "rgba(58, 127, 111, 0.26)",
    proseMarker: "rgba(92, 106, 114, 0.24)",
    proseWidgetBackground: "#f4f0d9",
    proseWidgetBorder: "#d8d3ba",
    statusOkay: "#8da101",
    statusWarning: "#dfa000",
    statusError: "#f85552",
  }),
  theme("everforest-dark", "Everforest Dark", "Everforest", "dark", {
    ...DEFAULT_CLAROS_THEME,
    appBackground: "#1e2326",
    editorBackground: "#272e33",
    proseText: "#d3c6aa",
    proseMuted: "#9da9a0",
    proseHeading: "#e6d9bd",
    proseLink: "#a7c080",
    proseSelection: "rgba(167, 192, 128, 0.2)",
    proseCursor: "#e6d9bd",
    proseFocusRing: "rgba(167, 192, 128, 0.28)",
    proseMarker: "rgba(211, 198, 170, 0.24)",
    proseWidgetBackground: "#2e383c",
    proseWidgetBorder: "#4f5b58",
    statusOkay: "#a7c080",
    statusWarning: "#dbbc7f",
    statusError: "#e67e80",
  }),
  theme("catppuccin-light", "Catppuccin Light", "Catppuccin", "light", {
    ...DEFAULT_CLAROS_THEME,
    appBackground: "#eff1f5",
    editorBackground: "#f6f1ee",
    proseText: "#4c4f69",
    proseMuted: "#7c7f93",
    proseHeading: "#363a4f",
    proseLink: "#1e66f5",
    proseSelection: "rgba(30, 102, 245, 0.18)",
    proseCursor: "#4c4f69",
    proseFocusRing: "rgba(30, 102, 245, 0.24)",
    proseMarker: "rgba(76, 79, 105, 0.24)",
    proseWidgetBackground: "#e6e9ef",
    proseWidgetBorder: "#ccd0da",
    statusOkay: "#40a02b",
    statusWarning: "#df8e1d",
    statusError: "#d20f39",
  }),
  theme("catppuccin-dark", "Catppuccin Dark", "Catppuccin", "dark", {
    ...DEFAULT_CLAROS_THEME,
    appBackground: "#181825",
    editorBackground: "#1e1e2e",
    proseText: "#cdd6f4",
    proseMuted: "#a6adc8",
    proseHeading: "#f5e0dc",
    proseLink: "#89b4fa",
    proseSelection: "rgba(137, 180, 250, 0.2)",
    proseCursor: "#f5e0dc",
    proseFocusRing: "rgba(137, 180, 250, 0.28)",
    proseMarker: "rgba(205, 214, 244, 0.24)",
    proseWidgetBackground: "#313244",
    proseWidgetBorder: "#45475a",
    statusOkay: "#a6e3a1",
    statusWarning: "#f9e2af",
    statusError: "#f38ba8",
  }),
];

export const DEFAULT_CLAROS_THEME_ID: ClarosThemeId = "default-light";

export function getClarosTheme(id: ClarosThemeId): ClarosThemeDefinition {
  return CLAROS_THEMES.find((themeDefinition) => themeDefinition.id === id) ?? CLAROS_THEMES[0];
}

export function isClarosThemeId(value: string): value is ClarosThemeId {
  return CLAROS_THEMES.some((themeDefinition) => themeDefinition.id === value);
}

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
  statusOkay: "--claros-status-okay",
  statusWarning: "--claros-status-warning",
  statusError: "--claros-status-error",
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

export function applyNamedTheme(element: HTMLElement, id: ClarosThemeId): void {
  const themeDefinition = getClarosTheme(id);
  element.setAttribute(CLAROS_THEME_ATTRIBUTE, themeDefinition.id);
  applyThemeTokens(element, themeDefinition.tokens);
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
    ".cm-claros-heading-line": {
      color: "var(--claros-prose-heading)",
      lineHeight: "1.34",
      paddingTop: "1.15em",
    },
    ".cm-claros-heading-line-h1": {
      fontSize: "1.8em",
      fontWeight: "650",
      letterSpacing: "0",
      paddingBottom: "0.55em",
      textAlign: "center",
    },
    ".cm-claros-heading-line-h2": {
      fontSize: "1.32em",
      fontWeight: "600",
      paddingBottom: "0.35em",
      textAlign: "center",
    },
    ".cm-claros-heading-line-h3": {
      fontSize: "1.12em",
      fontWeight: "600",
      paddingBottom: "0.2em",
    },
    ".cm-claros-heading-line-h4, .cm-claros-heading-line-h5, .cm-claros-heading-line-h6": {
      fontSize: "1em",
      fontWeight: "600",
      paddingBottom: "0.1em",
    },
    ".cm-claros-emphasis": {
      fontStyle: "italic",
    },
    ".cm-claros-strong": {
      fontWeight: "700",
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
      fontFamily:
        '"Latin Modern Mono Light Cond", "Latin Modern Mono Light Condensed", "Arial Narrow", "Roboto Condensed", var(--claros-prose-mono-font)',
      fontStretch: "condensed",
      letterSpacing: "-0.12em",
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
