import { load, dump } from "js-yaml";
import type { NoteFrontmatter } from "./types.js";

// Matches optional-empty frontmatter: allows `---\n---` (no newline before closing fence)
const FRONTMATTER_FENCE_RE = /^---\r?\n([\s\S]*?)\r?\n?---(?:\r?\n|$)/;

/**
 * Parse YAML frontmatter from a markdown string.
 *
 * Returns:
 *   - frontmatter: parsed key-value pairs (empty object when absent or empty block)
 *   - body:        everything after the closing `---` delimiter, preserving whitespace exactly;
 *                  or the full input string when no frontmatter block is present
 */
export function parseNoteFrontmatter(markdown: string): {
  frontmatter: NoteFrontmatter;
  body: string;
} {
  const match = FRONTMATTER_FENCE_RE.exec(markdown);
  if (!match) {
    return { frontmatter: {}, body: markdown };
  }

  const yamlContent = match[1];
  const afterFence = markdown.slice(match[0].length);

  let parsed: unknown;
  try {
    parsed = load(yamlContent);
  } catch {
    parsed = {};
  }

  const frontmatter: NoteFrontmatter =
    parsed !== null && parsed !== undefined && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as NoteFrontmatter)
      : {};

  return { frontmatter, body: afterFence };
}

/**
 * Serialize frontmatter + body back to a markdown string.
 * The body is preserved exactly — no whitespace is added or stripped.
 */
export function serializeNoteFrontmatter(frontmatter: NoteFrontmatter, body: string): string {
  const yamlStr = dump(frontmatter, { lineWidth: -1 }).trimEnd();
  return `---\n${yamlStr}\n---\n${body}`;
}

export function replaceMarkdownBodyPreservingFrontmatter(
  previousMarkdown: string,
  body: string
): string {
  const match = FRONTMATTER_FENCE_RE.exec(previousMarkdown);
  return match === null ? body : `${match[0]}${body}`;
}
