/** Parsed YAML frontmatter from a Claros note or manuscript file. */
export interface NoteFrontmatter {
  title?: string;
  type?: string;
  aliases?: string[];
  tags?: string[];
  [key: string]: unknown;
}
