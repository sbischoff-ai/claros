import * as fs from "node:fs";
import * as path from "node:path";
import { getAtPath, parseStateFile, serializeStateFile, setAtPath } from "@claros/story-format";
import type { ProjectStateSnapshot, StateAdapter, StateData } from "@claros/story-format";

export interface FileStateAdapterOptions {
  /** Absolute path to the project root folder. */
  projectRoot: string;
}

export class StateAdapterError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "StateAdapterError";
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }

  declare cause?: unknown;
}

export class FileStateAdapter implements StateAdapter {
  private readonly projectRoot: string;

  private readonly cache = new Map<string, StateData>();

  constructor(options: FileStateAdapterOptions) {
    this.projectRoot = options.projectRoot;
  }

  getStory(statePath: string): unknown {
    return getAtPath(this.loadStateData(this.storyFilePath()), statePath);
  }

  setStory(statePath: string, value: unknown): void {
    this.writeStateData(this.storyFilePath(), statePath, value);
  }

  getScene(sceneId: string, statePath: string): unknown {
    return getAtPath(this.loadStateData(this.sceneFilePath(sceneId)), statePath);
  }

  setScene(sceneId: string, statePath: string, value: unknown): void {
    this.writeStateData(this.sceneFilePath(sceneId), statePath, value);
  }

  getChapter(chapterId: string, statePath: string): unknown {
    return getAtPath(this.loadStateData(this.chapterFilePath(chapterId)), statePath);
  }

  setChapter(chapterId: string, statePath: string, value: unknown): void {
    this.writeStateData(this.chapterFilePath(chapterId), statePath, value);
  }

  getAll(sceneId?: string, chapterId?: string): ProjectStateSnapshot {
    const scenes: Record<string, StateData> = {};
    if (sceneId !== undefined) {
      scenes[sceneId] = this.loadStateData(this.sceneFilePath(sceneId));
    }

    const chapters: Record<string, StateData> = {};
    if (chapterId !== undefined) {
      chapters[chapterId] = this.loadStateData(this.chapterFilePath(chapterId));
    }

    return {
      story: this.loadStateData(this.storyFilePath()),
      scenes,
      chapters,
    };
  }

  private storyFilePath(): string {
    return path.join(this.projectRoot, "state", "story.yaml");
  }

  private sceneFilePath(sceneId: string): string {
    return path.join(this.projectRoot, "state", "scenes", `${sceneId}.yaml`);
  }

  private chapterFilePath(chapterId: string): string {
    return path.join(this.projectRoot, "state", "chapters", `${chapterId}.yaml`);
  }

  private loadStateData(filePath: string): StateData {
    const cached = this.cache.get(filePath);
    if (cached !== undefined) {
      return cached;
    }

    let data: StateData = {};
    try {
      if (fs.existsSync(filePath)) {
        data = parseStateFile(fs.readFileSync(filePath, "utf-8")).data;
      }
    } catch (error) {
      throw new StateAdapterError(`Failed to load state file: ${filePath}`, { cause: error });
    }

    this.cache.set(filePath, data);
    return data;
  }

  private writeStateData(filePath: string, statePath: string, value: unknown): void {
    const current = this.loadStateData(filePath);
    const next = setAtPath(current, statePath, value);
    this.cache.set(filePath, next);

    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, serializeStateFile({ data: next }));
    } catch (error) {
      throw new StateAdapterError(`Failed to write state file: ${filePath}`, { cause: error });
    }
  }
}
