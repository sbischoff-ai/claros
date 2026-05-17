import type { StateData } from "../state/types.js";

/** Parsed YAML frontmatter from a Claros note or manuscript file. */
export interface NoteFrontmatter {
  type?: string
  aliases?: string[]
  tags?: string[]
  /** Entity state. Root keys are module namespaces.
   *  Absent when the note has no `state:` key. */
  state?: StateData
  [key: string]: unknown
}
