import type {
  ProjectDirEntry,
  ProjectFileReader,
  ProjectFileStat,
  ProjectFileWriter,
} from "@claros/story-state/browser";

export interface BrowserDirectoryPicker {
  showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<DirectoryHandle>;
}

export interface DirectoryHandle {
  readonly kind: "directory";
  readonly name: string;
  values(): AsyncIterable<FileHandle | DirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandle>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirectoryHandle>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
}

interface FileHandle {
  readonly kind: "file";
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<WritableFileStream>;
}

interface WritableFileStream {
  write(content: string): Promise<void>;
  close(): Promise<void>;
}

export class BrowserProjectFileSystem implements ProjectFileReader, ProjectFileWriter {
  constructor(private readonly root: DirectoryHandle) {}

  async readFile(path: string): Promise<string> {
    return (await this.getFileHandle(path)).getFile().then((file) => file.text());
  }

  async readDir(path: string): Promise<ProjectDirEntry[]> {
    const directory = await this.getDirectoryHandle(path);
    const entries: ProjectDirEntry[] = [];
    for await (const entry of directory.values()) {
      entries.push({
        name: entry.name,
        isDirectory: entry.kind === "directory",
      });
    }
    return entries;
  }

  async stat(path: string): Promise<ProjectFileStat> {
    const parts = pathParts(path);
    if (parts.length === 0) {
      return { exists: true, isDirectory: true };
    }

    try {
      await this.getDirectoryHandle(path);
      return { exists: true, isDirectory: true };
    } catch {
      try {
        await this.getFileHandle(path);
        return { exists: true, isDirectory: false };
      } catch {
        return { exists: false, isDirectory: false };
      }
    }
  }

  async writeFileAtomic(path: string, content: string): Promise<void> {
    const { directory, filename } = await this.getParentDirectory(path, true);
    const handle = await directory.getFileHandle(filename, { create: true });
    const writable = await handle.createWritable();
    try {
      await writable.write(content);
    } finally {
      await writable.close();
    }
  }

  async mkdir(path: string, recursive = true): Promise<void> {
    if (!recursive) {
      const { directory, filename } = await this.getParentDirectory(path, false);
      await directory.getDirectoryHandle(filename, { create: true });
      return;
    }

    await this.getDirectoryHandle(path, true);
  }

  async renameFile(_fromPath: string, _toPath: string): Promise<void> {
    throw new Error("Renaming files is not available in the browser file adapter yet");
  }

  async removeFile(path: string): Promise<void> {
    const { directory, filename } = await this.getParentDirectory(path, false);
    await directory.removeEntry(filename, { recursive: true });
  }

  private async getFileHandle(path: string): Promise<FileHandle> {
    const { directory, filename } = await this.getParentDirectory(path, false);
    return directory.getFileHandle(filename);
  }

  private async getDirectoryHandle(path: string, create = false): Promise<DirectoryHandle> {
    let current = this.root;
    for (const part of pathParts(path)) {
      current = await current.getDirectoryHandle(part, { create });
    }
    return current;
  }

  private async getParentDirectory(
    path: string,
    create: boolean
  ): Promise<{ directory: DirectoryHandle; filename: string }> {
    const parts = pathParts(path);
    const filename = parts.at(-1);
    if (filename === undefined) {
      throw new Error("Expected a file path");
    }
    const directoryPath = parts.slice(0, -1).join("/");
    return {
      directory: await this.getDirectoryHandle(directoryPath, create),
      filename,
    };
  }
}

function pathParts(path: string): string[] {
  return path
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part.length > 0 && part !== ".");
}
