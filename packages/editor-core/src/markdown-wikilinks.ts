import { Prec, type SelectionRange } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  type KeyBinding,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { extractWikilinks } from "@claros/story-format/browser";

export interface MarkdownWikilinkReference {
  raw: string;
  target: string;
  alias?: string;
  from: number;
  to: number;
  displayFrom: number;
  displayTo: number;
}

export interface MarkdownWikilinkCandidate {
  path: string;
  title: string;
}

export type MarkdownWikilinkResolution =
  | { status: "resolved"; path: string; reason: string }
  | {
      status: "ambiguous";
      target: string;
      reason: string;
      candidates: MarkdownWikilinkCandidate[];
    }
  | { status: "unresolved"; target: string };

export interface MarkdownWikilinkPreview {
  path: string;
  title: string;
  excerpt: string;
}

export interface MarkdownWikilinkOptions {
  currentPath(): string | undefined;
  resolve(
    reference: MarkdownWikilinkReference,
    fromPath?: string
  ): MarkdownWikilinkResolution | Promise<MarkdownWikilinkResolution>;
  preview(path: string): MarkdownWikilinkPreview | Promise<MarkdownWikilinkPreview>;
  open(path: string): void | Promise<void>;
  create(
    reference: MarkdownWikilinkReference,
    fromPath: string | undefined,
    target: string
  ): void | Promise<void>;
}

const linkDecoration = Decoration.mark({ class: "cm-claros-wikilink" });
const HOVER_DELAY_MS = 500;
const READONLY_WIKILINK_SELECTOR = "[data-claros-wikilink-index]";
const WIKILINK_STYLE_ID = "claros-wikilink-styles";

export interface BindReadonlyMarkdownWikilinksOptions {
  references: readonly MarkdownWikilinkReference[];
  fromPath: string;
  options: MarkdownWikilinkOptions;
}

export function bindReadonlyMarkdownWikilinks(
  container: HTMLElement,
  binding: BindReadonlyMarkdownWikilinksOptions
): () => void {
  installWikilinkStyles();
  const interaction = new WikilinkInteraction(container, binding.options);
  let hoverTimer: ReturnType<typeof setTimeout> | undefined;
  let hoverKey = "";

  const referenceForEvent = (event: Event): MarkdownWikilinkReference | undefined => {
    const element = (event.target as Element | null)?.closest<HTMLElement>(
      READONLY_WIKILINK_SELECTOR
    );
    if (element == null || !container.contains(element)) return undefined;
    const index = Number(element.dataset.clarosWikilinkIndex);
    return Number.isInteger(index) ? binding.references[index] : undefined;
  };
  const clearHoverTimer = (): void => {
    if (hoverTimer === undefined) return;
    clearTimeout(hoverTimer);
    hoverTimer = undefined;
  };
  const mouseover = (event: MouseEvent): void => {
    const reference = referenceForEvent(event);
    if (reference === undefined) return;
    const key = `${reference.from}:${reference.to}`;
    if (key === hoverKey && (hoverTimer !== undefined || interaction.tooltipIsOpen)) return;
    hoverKey = key;
    clearHoverTimer();
    hoverTimer = setTimeout(() => {
      hoverTimer = undefined;
      void interaction.showReference(reference, event.clientX, event.clientY, binding.fromPath);
    }, HOVER_DELAY_MS);
  };
  const mouseout = (event: MouseEvent): void => {
    if (referenceForEvent(event) === undefined) return;
    clearHoverTimer();
    hoverKey = "";
    interaction.leave();
  };
  const click = (event: MouseEvent): void => {
    const reference = referenceForEvent(event);
    if (reference === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    void interaction.activateReference(reference, event.clientX, event.clientY, binding.fromPath);
  };

  container.addEventListener("mouseover", mouseover);
  container.addEventListener("mouseout", mouseout);
  container.addEventListener("click", click);
  return () => {
    clearHoverTimer();
    interaction.destroy();
    container.removeEventListener("mouseover", mouseover);
    container.removeEventListener("mouseout", mouseout);
    container.removeEventListener("click", click);
  };
}

export function findMarkdownWikilinkReferences(
  markdown: string,
  selectionRanges: readonly Pick<SelectionRange, "from" | "to">[] = []
): MarkdownWikilinkReference[] {
  return findAllMarkdownWikilinkReferences(markdown).filter(
    (link) => !selectionIntersectsLine(markdown, selectionRanges, link.from)
  );
}

export function wikilinkAtCursor(
  markdown: string,
  cursor: number
): MarkdownWikilinkReference | undefined {
  return findAllMarkdownWikilinkReferences(markdown).find(
    (link) => cursor >= link.from - 1 && cursor <= link.to + 1
  );
}

export function markdownWikilinkExtension(options: MarkdownWikilinkOptions) {
  installWikilinkStyles();
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      private hoverTimer: ReturnType<typeof setTimeout> | undefined;
      private hoverKey = "";
      private readonly interaction: WikilinkInteraction;

      constructor(private readonly view: EditorView) {
        this.decorations = buildDecorations(view);
        this.interaction = new WikilinkInteraction(view.dom, options, () => this.view.focus());
      }

      update(update: ViewUpdate): void {
        if (update.docChanged || update.selectionSet || update.viewportChanged) {
          this.decorations = buildDecorations(update.view);
          if (update.docChanged || update.selectionSet) this.closeTooltip();
        }
      }

      destroy(): void {
        this.interaction.destroy();
        this.clearHoverTimer();
      }

      hover(event: MouseEvent): void {
        const reference = referenceAtMouseEvent(this.view, event);
        if (reference === undefined) {
          this.clearHoverTimer();
          this.hoverKey = "";
          return;
        }
        const key = `${reference.from}:${reference.to}`;
        if (this.hoverKey === key && this.interaction.tooltipIsOpen) return;
        if (this.hoverKey === key && this.hoverTimer !== undefined) return;
        this.hoverKey = key;
        this.clearHoverTimer();
        this.hoverTimer = setTimeout(() => {
          this.hoverTimer = undefined;
          void this.interaction.showReference(
            reference,
            event.clientX,
            event.clientY,
            options.currentPath()
          );
        }, HOVER_DELAY_MS);
      }

      leave(): void {
        this.clearHoverTimer();
        this.interaction.leave();
      }

      handleMousedown(event: MouseEvent): boolean {
        const reference = referenceAtMouseEvent(this.view, event);
        if (reference === undefined) return false;
        event.preventDefault();
        event.stopPropagation();
        void this.interaction.activateReference(
          reference,
          event.clientX,
          event.clientY,
          options.currentPath()
        );
        return true;
      }

      keydown(event: KeyboardEvent): boolean {
        return this.interaction.keydown(event);
      }

      async activateFromKeyboard(): Promise<boolean> {
        const reference = wikilinkAtCursor(
          this.view.state.doc.toString(),
          this.view.state.selection.main.head
        );
        if (reference === undefined) return false;
        const coords = this.view.coordsAtPos(reference.displayFrom) ?? {
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
        };
        await this.interaction.activateReference(
          reference,
          coords.left,
          coords.bottom,
          options.currentPath(),
          true
        );
        return true;
      }

      private closeTooltip(): void {
        this.interaction.closeTooltip();
      }

      private clearHoverTimer(): void {
        if (this.hoverTimer !== undefined) {
          clearTimeout(this.hoverTimer);
          this.hoverTimer = undefined;
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
      eventHandlers: {
        mousemove(event) {
          this.hover(event);
        },
        mouseleave() {
          this.leave();
        },
        mousedown(event) {
          return this.handleMousedown(event);
        },
        keydown(event) {
          return this.keydown(event);
        },
      },
    }
  );

  const bindings: KeyBinding[] = [
    {
      key: "Mod-Enter",
      run(view) {
        void view.plugin(plugin)?.activateFromKeyboard();
        return (
          wikilinkAtCursor(view.state.doc.toString(), view.state.selection.main.head) !== undefined
        );
      },
    },
  ];

  return [Prec.highest(plugin), keymap.of(bindings)];
}

class WikilinkInteraction {
  private tooltip: HTMLDivElement | undefined;
  private keyboardMode = false;
  private focusedCandidateIndex = 0;
  private cleanupKeyboardListener: (() => void) | undefined;

  constructor(
    private readonly tooltipParent: HTMLElement,
    private readonly options: MarkdownWikilinkOptions,
    private readonly returnFocus?: () => void
  ) {}

  get tooltipIsOpen(): boolean {
    return this.tooltip !== undefined;
  }

  destroy(): void {
    this.closeTooltip();
  }

  leave(): void {
    if (this.keyboardMode) return;
    window.setTimeout(() => {
      if (this.tooltip?.matches(":hover") !== true) this.closeTooltip();
    }, 40);
  }

  keydown(event: KeyboardEvent): boolean {
    if (!this.keyboardMode || this.tooltip === undefined) return false;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.closeTooltip();
      this.returnFocus?.();
      return true;
    }
    if (event.key === "ArrowDown" || event.key === "j") {
      event.preventDefault();
      event.stopPropagation();
      this.moveCandidate(1);
      return true;
    }
    if (event.key === "ArrowUp" || event.key === "k") {
      event.preventDefault();
      event.stopPropagation();
      this.moveCandidate(-1);
      return true;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      const candidate = this.tooltip.querySelector<HTMLButtonElement>(
        ".cm-claros-wikilink-candidate[data-focused='true']"
      );
      candidate?.click();
      return true;
    }
    return false;
  }

  async activateReference(
    reference: MarkdownWikilinkReference,
    x: number,
    y: number,
    fromPath: string | undefined,
    keyboard = false
  ): Promise<void> {
    const resolution = await this.options.resolve(reference, fromPath);
    if (resolution.status === "resolved") {
      await this.options.open(resolution.path);
      return;
    }
    if (resolution.status === "unresolved") {
      await this.options.create(reference, fromPath, resolution.target);
      return;
    }
    this.showAmbiguous(resolution, x, y, keyboard);
  }

  async showReference(
    reference: MarkdownWikilinkReference,
    x: number,
    y: number,
    fromPath: string | undefined,
    keyboard = false
  ): Promise<void> {
    const resolution = await this.options.resolve(reference, fromPath);
    if (resolution.status === "resolved") {
      const preview = await this.options.preview(resolution.path);
      this.showPreview(preview, x, y, keyboard);
      return;
    }
    if (resolution.status === "ambiguous") {
      this.showAmbiguous(resolution, x, y, keyboard);
    }
  }

  closeTooltip(): void {
    this.tooltip?.remove();
    this.tooltip = undefined;
    this.keyboardMode = false;
    this.cleanupKeyboardListener?.();
    this.cleanupKeyboardListener = undefined;
  }

  private showPreview(
    preview: MarkdownWikilinkPreview,
    x: number,
    y: number,
    keyboard: boolean
  ): void {
    const tooltip = this.createTooltip(x, y);
    this.keyboardMode = keyboard;
    tooltip.append(previewNode(preview));
  }

  private showAmbiguous(
    resolution: Extract<MarkdownWikilinkResolution, { status: "ambiguous" }>,
    x: number,
    y: number,
    keyboard: boolean
  ): void {
    this.focusedCandidateIndex = 0;
    const tooltip = this.createTooltip(x, y);
    this.keyboardMode = keyboard;
    if (keyboard) this.installKeyboardListener();
    const title = document.createElement("div");
    title.className = "cm-claros-wikilink-tooltip-title";
    title.textContent = `Matches for ${resolution.target}`;
    tooltip.append(title);

    for (const [index, candidate] of resolution.candidates.entries()) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "cm-claros-wikilink-candidate";
      button.dataset.index = String(index);
      button.dataset.focused = String(index === this.focusedCandidateIndex);
      button.innerHTML = `<span></span><small></small>`;
      button.querySelector("span")!.textContent = candidate.title;
      button.querySelector("small")!.textContent = candidate.path;
      button.addEventListener("mouseenter", () => {
        this.focusedCandidateIndex = index;
        this.renderCandidateFocus();
        void Promise.resolve(this.options.preview(candidate.path)).then((preview) => {
          const existing = tooltip.querySelector(".cm-claros-wikilink-preview");
          existing?.remove();
          tooltip.append(previewNode(preview));
        });
      });
      button.addEventListener("click", () => void this.options.open(candidate.path));
      tooltip.append(button);
    }
    this.renderCandidateFocus();
  }

  private moveCandidate(delta: number): void {
    const count = this.tooltip?.querySelectorAll(".cm-claros-wikilink-candidate").length ?? 0;
    if (count === 0) return;
    this.focusedCandidateIndex = (this.focusedCandidateIndex + delta + count) % count;
    this.renderCandidateFocus();
  }

  private renderCandidateFocus(): void {
    this.tooltip
      ?.querySelectorAll<HTMLButtonElement>(".cm-claros-wikilink-candidate")
      .forEach((button, index) => {
        button.dataset.focused = String(index === this.focusedCandidateIndex);
      });
  }

  private createTooltip(x: number, y: number): HTMLDivElement {
    this.closeTooltip();
    const tooltip = document.createElement("div");
    tooltip.className = "cm-claros-wikilink-tooltip";
    tooltip.tabIndex = -1;
    tooltip.style.left = `${Math.min(x + 12, window.innerWidth - 340)}px`;
    tooltip.style.top = `${Math.min(y + 16, window.innerHeight - 220)}px`;
    tooltip.addEventListener("mouseleave", () => {
      if (!this.keyboardMode) this.closeTooltip();
    });
    tooltip.addEventListener("keydown", (event) => {
      this.keydown(event);
    });
    this.tooltipParent.append(tooltip);
    this.tooltip = tooltip;
    return tooltip;
  }

  private installKeyboardListener(): void {
    this.cleanupKeyboardListener?.();
    const listener = (event: KeyboardEvent) => {
      if (this.keydown(event)) event.stopImmediatePropagation();
    };
    window.addEventListener("keydown", listener, { capture: true });
    this.cleanupKeyboardListener = () => {
      window.removeEventListener("keydown", listener, { capture: true });
    };
  }
}

function installWikilinkStyles(): void {
  if (typeof document === "undefined" || document.getElementById(WIKILINK_STYLE_ID) !== null)
    return;
  const style = document.createElement("style");
  style.id = WIKILINK_STYLE_ID;
  style.textContent = wikilinkStyles;
  document.head.append(style);
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const ranges = findMarkdownWikilinkReferences(
    view.state.doc.toString(),
    view.state.selection.ranges
  ).sort((left, right) => left.displayFrom - right.displayFrom || left.displayTo - right.displayTo);

  let lastTo = -1;
  for (const range of ranges) {
    if (range.displayFrom < lastTo || range.displayFrom >= range.displayTo) continue;
    builder.add(range.displayFrom, range.displayTo, linkDecoration);
    lastTo = range.displayTo;
  }
  return builder.finish();
}

function referenceAtMouseEvent(
  view: EditorView,
  event: MouseEvent
): MarkdownWikilinkReference | undefined {
  const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
  if (position === null) return undefined;
  return findAllMarkdownWikilinkReferences(view.state.doc.toString()).find(
    (reference) => position >= reference.displayFrom && position <= reference.displayTo
  );
}

function findAllMarkdownWikilinkReferences(markdown: string): MarkdownWikilinkReference[] {
  return extractWikilinks("", markdown).map((link) => {
    const from = link.range.start.offset;
    const to = link.range.end.offset;
    return {
      raw: link.raw,
      target: link.target,
      alias: link.alias,
      from,
      to,
      ...displayRangeForRawLink(markdown, from, to),
    };
  });
}

function selectionIntersectsLine(
  markdown: string,
  selectionRanges: readonly Pick<SelectionRange, "from" | "to">[],
  position: number
): boolean {
  const lineStart = markdown.lastIndexOf("\n", Math.max(position - 1, 0)) + 1;
  const nextLineBreak = markdown.indexOf("\n", position);
  const lineEnd = nextLineBreak === -1 ? markdown.length : nextLineBreak;
  return selectionRanges.some((range) => {
    const from = Math.min(range.from, range.to);
    const to = Math.max(range.from, range.to);
    return from <= lineEnd && to >= lineStart;
  });
}

function displayRangeForRawLink(
  markdown: string,
  from: number,
  to: number
): { displayFrom: number; displayTo: number } {
  const raw = markdown.slice(from, to);
  const pipe = raw.indexOf("|");
  if (pipe !== -1) {
    return { displayFrom: from + pipe + 1, displayTo: to - 2 };
  }
  return { displayFrom: from + 2, displayTo: to - 2 };
}

function previewNode(preview: MarkdownWikilinkPreview): HTMLDivElement {
  const wrapper = document.createElement("div");
  wrapper.className = "cm-claros-wikilink-preview";

  const title = document.createElement("div");
  title.className = "cm-claros-wikilink-tooltip-title";
  title.textContent = preview.title;

  const path = document.createElement("div");
  path.className = "cm-claros-wikilink-tooltip-path";
  path.textContent = preview.path;

  const excerpt = document.createElement("p");
  excerpt.textContent = preview.excerpt;

  wrapper.append(title, path, excerpt);
  return wrapper;
}

const wikilinkStyles = `
.claros-readonly-wikilink {
  min-height: 0;
  border: 0;
  border-radius: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  font: inherit;
}
.claros-readonly-wikilink:hover {
  border-color: transparent;
  background: transparent;
  color: inherit;
}
.cm-claros-wikilink {
  text-decoration: underline dotted color-mix(in srgb, currentColor 45%, transparent);
  text-underline-offset: 0.18em;
  cursor: pointer;
}
.cm-claros-wikilink:hover {
  text-decoration-color: currentColor;
}
.cm-claros-wikilink-tooltip {
  position: fixed;
  z-index: 100;
  box-sizing: border-box;
  display: grid;
  gap: 0.45rem;
  width: min(20rem, calc(100vw - 1rem));
  max-height: min(22rem, calc(100vh - 1rem));
  overflow: auto;
  border: 1px solid var(--claros-prose-widget-border);
  border-radius: 8px;
  padding: 0.75rem;
  background: var(--claros-editor-background);
  color: var(--claros-prose-text);
  box-shadow: 0 1rem 3rem color-mix(in srgb, var(--claros-prose-text) 18%, transparent);
  font-family: system-ui, sans-serif;
  font-size: 0.84rem;
  line-height: 1.35;
}
.cm-claros-wikilink-tooltip-title {
  font-weight: 650;
}
.cm-claros-wikilink-tooltip-path,
.cm-claros-wikilink-candidate small {
  color: var(--claros-prose-muted);
  font-family: var(--claros-prose-mono-font);
  font-size: 0.72rem;
}
.cm-claros-wikilink-tooltip p {
  margin: 0;
  color: var(--claros-prose-muted);
}
.cm-claros-wikilink-candidate {
  display: grid;
  gap: 0.15rem;
  width: 100%;
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 0.4rem 0.5rem;
  background: transparent;
  color: inherit;
  text-align: left;
}
.cm-claros-wikilink-candidate[data-focused="true"],
.cm-claros-wikilink-candidate:hover {
  border-color: var(--claros-prose-focus-ring);
  background: var(--claros-prose-widget-background);
}
`;
