// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { renderReadonlyMarkdown } from "./rendered-markdown";

describe("renderReadonlyMarkdown", () => {
  it("renders indexed wikilink buttons without markdown brackets", () => {
    const rendered = renderReadonlyMarkdown("Meet [[Kareth]] and [[North Gate|the gate]].");

    expect(rendered.html).toContain('data-claros-wikilink-index="0"');
    expect(rendered.html).toContain(">Kareth</button>");
    expect(rendered.html).toContain('data-claros-wikilink-index="1"');
    expect(rendered.html).toContain(">the gate</button>");
    expect(rendered.html).not.toContain("[[");
    expect(rendered.wikilinks.map((link) => link.target)).toEqual(["Kareth", "North Gate"]);
  });

  it("escapes wikilink display text and sanitizes rendered markdown", () => {
    const rendered = renderReadonlyMarkdown(
      'Meet [[Kareth|<img src=x onerror="alert(1)">]]. <script>alert(2)</script>'
    );
    const container = document.createElement("div");
    container.innerHTML = rendered.html;

    expect(container.textContent).toContain('<img src=x onerror="alert(1)">');
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
  });
});
