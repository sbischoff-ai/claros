import * as path from "node:path";
import {
  getAtPath,
  parseNoteFrontmatter,
  serializeNoteFrontmatter,
  setAtPath,
  type NoteFrontmatter,
  type ProjectFileReader,
  type ProjectFileWriter,
} from "@claros/story-format";
import {
  NodeProjectFileReader,
  NodeProjectFileWriter,
  ensureParentDirectory,
  normalizeProjectRoot,
  toAbsoluteProjectPath,
} from "../project/files.js";

export interface NoteFrontmatterIOOptions {
  fileReader?: ProjectFileReader;
  fileWriter?: ProjectFileWriter;
}

export class NoteNotFoundError extends Error {
  constructor(notePathOrResolvedRef: string) {
    super(`Note not found: ${notePathOrResolvedRef}`);
    this.name = "NoteNotFoundError";
  }
}

export async function getNoteFrontmatter(
  notePathOrResolvedRef: string,
  projectRoot: string,
  options?: NoteFrontmatterIOOptions
): Promise<NoteFrontmatter | undefined> {
  const reader = options?.fileReader ?? new NodeProjectFileReader();
  const notePath = await resolveNotePath(notePathOrResolvedRef, projectRoot, reader);
  if (notePath === undefined) {
    return undefined;
  }

  const content = await reader.readFile(notePath);
  return parseNoteFrontmatter(content).frontmatter;
}

export async function setNoteFrontmatter(
  notePathOrResolvedRef: string,
  projectRoot: string,
  frontmatter: NoteFrontmatter,
  options?: NoteFrontmatterIOOptions
): Promise<void> {
  const reader = options?.fileReader ?? new NodeProjectFileReader();
  const writer = options?.fileWriter ?? new NodeProjectFileWriter();
  const notePath = await resolveNotePath(notePathOrResolvedRef, projectRoot, reader);
  if (notePath === undefined) {
    throw new NoteNotFoundError(notePathOrResolvedRef);
  }

  const content = await reader.readFile(notePath);
  const { body } = parseNoteFrontmatter(content);
  const nextContent = serializeNoteFrontmatter(frontmatter, body);
  await ensureParentDirectory(notePath, writer);
  await writer.writeFileAtomic(notePath, nextContent);
}

export async function getNoteFrontmatterPath(
  notePathOrResolvedRef: string,
  projectRoot: string,
  frontmatterPath: string,
  options?: NoteFrontmatterIOOptions
): Promise<unknown> {
  const frontmatter = await getNoteFrontmatter(notePathOrResolvedRef, projectRoot, options);
  if (frontmatter === undefined) {
    return undefined;
  }

  return getAtPath(frontmatter as Record<string, unknown>, frontmatterPath);
}

export async function setNoteFrontmatterPath(
  notePathOrResolvedRef: string,
  projectRoot: string,
  frontmatterPath: string,
  value: unknown,
  options?: NoteFrontmatterIOOptions
): Promise<void> {
  const reader = options?.fileReader ?? new NodeProjectFileReader();
  const writer = options?.fileWriter ?? new NodeProjectFileWriter();
  const notePath = await resolveNotePath(notePathOrResolvedRef, projectRoot, reader);
  if (notePath === undefined) {
    throw new NoteNotFoundError(notePathOrResolvedRef);
  }

  const content = await reader.readFile(notePath);
  const { frontmatter, body } = parseNoteFrontmatter(content);
  const nextFrontmatter = setAtPath(
    frontmatter as Record<string, unknown>,
    frontmatterPath,
    value
  ) as NoteFrontmatter;
  const nextContent = serializeNoteFrontmatter(nextFrontmatter, body);
  await ensureParentDirectory(notePath, writer);
  await writer.writeFileAtomic(notePath, nextContent);
}

async function resolveNotePath(
  notePathOrResolvedRef: string,
  projectRoot: string,
  reader: ProjectFileReader
): Promise<string | undefined> {
  const trimmedRef = notePathOrResolvedRef.trim();
  if (trimmedRef.length === 0) {
    return undefined;
  }

  const normalizedRoot = normalizeProjectRoot(projectRoot);
  const absoluteFromProject = toAbsoluteProjectPath(normalizedRoot, trimmedRef);
  const candidates = [
    absoluteFromProject,
    maybeMarkdown(absoluteFromProject),
    path.resolve(normalizedRoot, "notes", trimmedRef),
    maybeMarkdown(path.resolve(normalizedRoot, "notes", trimmedRef)),
  ].filter((candidate): candidate is string => candidate !== undefined);

  for (const candidate of candidates) {
    const stat = await reader.stat(candidate);
    if (stat.exists && !stat.isDirectory) {
      return candidate;
    }
  }

  const notesRoot = path.join(normalizedRoot, "notes");
  const notesRootStat = await reader.stat(notesRoot);
  if (!notesRootStat.exists || !notesRootStat.isDirectory) {
    return undefined;
  }

  const targetName = path.basename(trimmedRef, path.extname(trimmedRef)).toLowerCase();
  return findNoteByBasename(notesRoot, targetName, reader);
}

function maybeMarkdown(candidate: string): string | undefined {
  return path.extname(candidate).length === 0 ? `${candidate}.md` : undefined;
}

async function findNoteByBasename(
  dirPath: string,
  basenameLower: string,
  reader: ProjectFileReader
): Promise<string | undefined> {
  const entries = await reader.readDir(dirPath);

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory) {
      const nested = await findNoteByBasename(entryPath, basenameLower, reader);
      if (nested !== undefined) {
        return nested;
      }
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
