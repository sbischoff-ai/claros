import DOMPurify from "dompurify";
import { marked } from "marked";
import {
  findMarkdownWikilinkReferences,
  type MarkdownWikilinkReference,
} from "@claros/editor-core";

export interface RenderedReadonlyMarkdown {
  html: string;
  wikilinks: MarkdownWikilinkReference[];
}

export function renderReadonlyMarkdown(markdown: string): RenderedReadonlyMarkdown {
  const wikilinks = findMarkdownWikilinkReferences(markdown);
  const linkedMarkdown = wikilinks.reduceRight((rendered, reference, index) => {
    const display = reference.alias ?? reference.target;
    const button = [
      '<button type="button" class="claros-readonly-wikilink cm-claros-wikilink"',
      ` data-claros-wikilink-index="${index}">${escapeHtml(display)}</button>`,
    ].join("");
    return `${rendered.slice(0, reference.from)}${button}${rendered.slice(reference.to)}`;
  }, markdown);
  const html = marked.parse(linkedMarkdown, { async: false });
  return {
    html: typeof DOMPurify.sanitize === "function" ? DOMPurify.sanitize(html) : "",
    wikilinks,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
