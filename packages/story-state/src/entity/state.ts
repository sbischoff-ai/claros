import * as fs from "node:fs/promises";
import * as syncFs from "node:fs";
import * as path from "node:path";
import { parseStateFile, serializeStateFile } from "@claros/story-format";
import type { StateData } from "@claros/story-format";

export class EntityNotFoundError extends Error {
  constructor(entitySlug: string) {
    super(`Entity note not found: ${entitySlug}`);
    this.name = "EntityNotFoundError";
  }
}

/** Read the `state:` block from a wiki note's frontmatter.
 *  Searches notes/ recursively for <entitySlug>.md (case-insensitive match).
 *  entitySlug must be a kebab-case ID (e.g. "kareth", "the-priest").
 *  Returns undefined if not found or no state: key present. */
export async function getEntityState(
  entitySlug: string,
  projectRoot: string
): Promise<StateData | undefined> {
  const notePath = await findEntityNote(entitySlug, projectRoot);
  if (notePath === undefined) {
    return undefined;
  }

  const content = await fs.readFile(notePath, "utf-8");
  const frontmatter = splitFrontmatter(content);
  if (frontmatter === undefined) {
    return undefined;
  }

  const stateBlock = extractStateBlock(frontmatter.frontmatter);
  if (stateBlock === undefined) {
    return undefined;
  }

  return parseStateFile(stateBlock).data;
}

/** Write state into a wiki note's frontmatter `state:` key.
 *  Replaces the entire `state:` block; all other frontmatter keys and prose body preserved exactly.
 *  Throws EntityNotFoundError if the note file does not exist. */
export async function setEntityState(
  entitySlug: string,
  projectRoot: string,
  state: StateData
): Promise<void> {
  const notePath = await findEntityNote(entitySlug, projectRoot);
  if (notePath === undefined) {
    throw new EntityNotFoundError(entitySlug);
  }

  const content = await fs.readFile(notePath, "utf-8");
  const nextContent = replaceEntityState(content, state);
  await fs.writeFile(notePath, nextContent, "utf-8");
}

async function findEntityNote(
  entitySlug: string,
  projectRoot: string
): Promise<string | undefined> {
  const notesRoot = path.join(projectRoot, "notes");
  if (!syncFs.existsSync(notesRoot)) {
    return undefined;
  }
  return findEntityNoteInDirectory(notesRoot, entitySlug.toLowerCase());
}

async function findEntityNoteInDirectory(
  dirPath: string,
  entitySlug: string
): Promise<string | undefined> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const nested = await findEntityNoteInDirectory(entryPath, entitySlug);
      if (nested !== undefined) {
        return nested;
      }
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const extension = path.extname(entry.name);
    const basename = path.basename(entry.name, extension);
    if (extension.toLowerCase() === ".md" && basename.toLowerCase() === entitySlug) {
      return entryPath;
    }
  }

  return undefined;
}

function replaceEntityState(content: string, state: StateData): string {
  const newline = detectNewline(content);
  const serializedState = indentYaml(serializeStateFile({ data: state }).trimEnd(), newline);
  const stateSection = `state:${newline}${serializedState}`;
  const frontmatter = splitFrontmatter(content);

  if (frontmatter === undefined) {
    return `---${newline}${stateSection}${newline}---${newline}${content}`;
  }

  const nextFrontmatter = upsertStateBlock(frontmatter.frontmatter, stateSection, newline);
  const normalizedFrontmatter = nextFrontmatter.endsWith(newline)
    ? nextFrontmatter
    : `${nextFrontmatter}${newline}`;
  return `---${newline}${normalizedFrontmatter}---${frontmatter.after}`;
}

function splitFrontmatter(content: string): { frontmatter: string; after: string } | undefined {
  const delimiterMatch = content.match(/^---(\r?\n)/);
  if (delimiterMatch === null) {
    return undefined;
  }

  const newline = delimiterMatch[1];
  const start = delimiterMatch[0].length;
  const closingDelimiter = `${newline}---`;
  const closingIndex = content.indexOf(closingDelimiter, start);
  if (closingIndex === -1) {
    return undefined;
  }

  const frontmatter = content.slice(start, closingIndex);
  const after = content.slice(closingIndex + closingDelimiter.length);
  return { frontmatter, after };
}

function extractStateBlock(frontmatter: string): string | undefined {
  const parsed = locateStateBlock(frontmatter);
  if (parsed === undefined) {
    return undefined;
  }

  const block = frontmatter.slice(parsed.valueStart, parsed.end);
  const lines = block.split(/\r?\n/);
  const normalized = lines
    .map((line) => {
      if (line.length === 0) {
        return "";
      }
      return line.startsWith("  ") ? line.slice(2) : line;
    })
    .join("\n");

  return normalized.trim().length === 0 ? "{}\n" : `${normalized}\n`;
}

function upsertStateBlock(frontmatter: string, stateSection: string, newline: string): string {
  const parsed = locateStateBlock(frontmatter);

  if (parsed === undefined) {
    const withoutTrailingWhitespace = frontmatter.replace(/[\t ]*$/u, "");
    if (withoutTrailingWhitespace.length === 0) {
      return `${stateSection}${newline}`;
    }
    return `${withoutTrailingWhitespace}${newline}${stateSection}${newline}`;
  }

  const suffix = frontmatter.slice(parsed.end);
  const separator = suffix.length > 0 ? newline : "";
  return `${frontmatter.slice(0, parsed.start)}${stateSection}${separator}${suffix}`;
}

function locateStateBlock(
  frontmatter: string
): { start: number; valueStart: number; end: number } | undefined {
  const linePattern = /^state:\s*(?:#.*)?$/m;
  const match = linePattern.exec(frontmatter);
  if (match === null || match.index === undefined) {
    return undefined;
  }

  const start = match.index;
  const lineEnd = frontmatter.indexOf("\n", start);
  if (lineEnd === -1) {
    return {
      start,
      valueStart: frontmatter.length,
      end: frontmatter.length,
    };
  }

  const valueStart = lineEnd + 1;
  const remainder = frontmatter.slice(valueStart);
  const nextTopLevelKey = remainder.match(/^(?=[^\s\n][^\n]*:)/m);
  const end =
    nextTopLevelKey?.index !== undefined ? valueStart + nextTopLevelKey.index : frontmatter.length;

  return { start, valueStart, end };
}

function indentYaml(yaml: string, newline: string): string {
  if (yaml.length === 0 || yaml === "{}") {
    return `  {}`;
  }

  return yaml
    .split(/\r?\n/)
    .map((line) => `  ${line}`)
    .join(newline);
}

function detectNewline(content: string): string {
  return content.includes("\r\n") ? "\r\n" : "\n";
}
