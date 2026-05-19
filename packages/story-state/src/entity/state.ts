import * as fs from "node:fs/promises";
import * as syncFs from "node:fs";
import * as path from "node:path";
import {
  getAtPath,
  parseNoteFrontmatter,
  serializeNoteFrontmatter,
  setAtPath,
} from "@claros/story-format";
import type { NoteFrontmatter } from "@claros/story-format";

export class NoteNotFoundError extends Error {
  constructor(notePathOrResolvedRef: string) {
    super(`Note not found: ${notePathOrResolvedRef}`);
    this.name = "NoteNotFoundError";
  }
}

export async function getNoteFrontmatter(
  notePathOrResolvedRef: string,
  projectRoot: string
): Promise<NoteFrontmatter | undefined> {
  const notePath = await resolveNotePath(notePathOrResolvedRef, projectRoot);
  if (notePath === undefined) {
    return undefined;
  }

  const content = await fs.readFile(notePath, "utf-8");
  return parseNoteFrontmatter(content).frontmatter;
}

export async function setNoteFrontmatter(
  notePathOrResolvedRef: string,
  projectRoot: string,
  frontmatter: NoteFrontmatter
): Promise<void> {
  const notePath = await resolveNotePath(notePathOrResolvedRef, projectRoot);
  if (notePath === undefined) {
    throw new NoteNotFoundError(notePathOrResolvedRef);
  }

  const content = await fs.readFile(notePath, "utf-8");
  const { body } = parseNoteFrontmatter(content);
  const nextContent = serializeNoteFrontmatter(frontmatter, body);
  await fs.writeFile(notePath, nextContent, "utf-8");
}

export async function getNoteFrontmatterPath(
  notePathOrResolvedRef: string,
  projectRoot: string,
  frontmatterPath: string
): Promise<unknown> {
  const frontmatter = await getNoteFrontmatter(notePathOrResolvedRef, projectRoot);
  if (frontmatter === undefined) {
    return undefined;
  }

  return getAtPath(frontmatter as Record<string, unknown>, frontmatterPath);
}

export async function setNoteFrontmatterPath(
  notePathOrResolvedRef: string,
  projectRoot: string,
  frontmatterPath: string,
  value: unknown
): Promise<void> {
  const notePath = await resolveNotePath(notePathOrResolvedRef, projectRoot);
  if (notePath === undefined) {
    throw new NoteNotFoundError(notePathOrResolvedRef);
  }

  const content = await fs.readFile(notePath, "utf-8");
  const { frontmatter, body } = parseNoteFrontmatter(content);
  const nextFrontmatter = setAtPath(
    frontmatter as Record<string, unknown>,
    frontmatterPath,
    value
  ) as NoteFrontmatter;
  const nextContent = serializeNoteFrontmatter(nextFrontmatter, body);
  await fs.writeFile(notePath, nextContent, "utf-8");
}

async function resolveNotePath(
  notePathOrResolvedRef: string,
  projectRoot: string
): Promise<string | undefined> {
  const trimmedRef = notePathOrResolvedRef.trim();
  if (trimmedRef.length === 0) {
    return undefined;
  }

  const absoluteFromProject = path.resolve(projectRoot, trimmedRef);
  const candidates = [
    trimmedRef,
    absoluteFromProject,
    maybeMarkdown(trimmedRef),
    maybeMarkdown(absoluteFromProject),
    path.resolve(projectRoot, "notes", trimmedRef),
    maybeMarkdown(path.resolve(projectRoot, "notes", trimmedRef)),
  ].filter((candidate): candidate is string => candidate !== undefined);

  for (const candidate of candidates) {
    if (syncFs.existsSync(candidate) && syncFs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  const notesRoot = path.join(projectRoot, "notes");
  if (!syncFs.existsSync(notesRoot)) {
    return undefined;
  }

  const targetName = path.basename(trimmedRef, path.extname(trimmedRef)).toLowerCase();
  return findNoteByBasename(notesRoot, targetName);
}

function maybeMarkdown(candidate: string): string | undefined {
  return path.extname(candidate).length === 0 ? `${candidate}.md` : undefined;
}

async function findNoteByBasename(
  dirPath: string,
  basenameLower: string
): Promise<string | undefined> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const nested = await findNoteByBasename(entryPath, basenameLower);
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
    if (extension.toLowerCase() === ".md" && basename.toLowerCase() === basenameLower) {
      return entryPath;
    }
  }

  return undefined;
}
