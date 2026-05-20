import { lstat, mkdir, open, readdir, readFile, rename, rm } from "node:fs/promises";
import * as path from "node:path";
import type {
  ProjectDirEntry,
  ProjectFileReader,
  ProjectFileStat,
  ProjectFileWriter,
} from "@claros/story-format";

export class NodeProjectFileReader implements ProjectFileReader {
  async readFile(filePath: string): Promise<string> {
    return readFile(filePath, "utf8");
  }

  async readDir(dirPath: string): Promise<ProjectDirEntry[]> {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries.map((entry) => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
    }));
  }

  async stat(filePath: string): Promise<ProjectFileStat> {
    try {
      const stats = await lstat(filePath);
      return {
        exists: true,
        isDirectory: stats.isDirectory(),
      };
    } catch {
      return {
        exists: false,
        isDirectory: false,
      };
    }
  }
}

export class NodeProjectFileWriter implements ProjectFileWriter {
  async writeFileAtomic(filePath: string, content: string): Promise<void> {
    const directory = path.dirname(filePath);
    const basename = path.basename(filePath);
    const tempPath = path.join(
      directory,
      `.${basename}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    await mkdir(directory, { recursive: true });

    let handle;
    try {
      handle = await open(tempPath, "w");
      await handle.writeFile(content, "utf8");
      await handle.sync();
      await handle.close();
      handle = undefined;
      await rename(tempPath, filePath);
    } catch (error) {
      if (handle !== undefined) {
        await handle.close().catch(() => undefined);
      }
      await rm(tempPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async mkdir(dirPath: string, recursive = true): Promise<void> {
    await mkdir(dirPath, { recursive });
  }

  async renameFile(fromPath: string, toPath: string): Promise<void> {
    await mkdir(path.dirname(toPath), { recursive: true });
    await rename(fromPath, toPath);
  }

  async removeFile(filePath: string): Promise<void> {
    await rm(filePath, { force: true });
  }
}

export function normalizeProjectRoot(root: string): string {
  return path.resolve(root);
}

export function toAbsoluteProjectPath(projectRoot: string, candidatePath: string): string {
  return path.isAbsolute(candidatePath)
    ? path.normalize(candidatePath)
    : path.resolve(projectRoot, candidatePath);
}

export function toRelativeProjectPath(projectRoot: string, candidatePath: string): string {
  return path
    .relative(projectRoot, toAbsoluteProjectPath(projectRoot, candidatePath))
    .replace(/\\/g, "/");
}

export async function ensureParentDirectory(
  filePath: string,
  writer: ProjectFileWriter
): Promise<void> {
  await writer.mkdir(path.dirname(filePath), true);
}
