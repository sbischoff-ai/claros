import type { StateAdapter, StateData, ProjectStateSnapshot } from "@claros/story-format";
import { getAtPath, setAtPath } from "@claros/story-format";

/** In-memory StateAdapter implementation for tests. */
export function createInMemoryStateAdapter(initial?: {
  story?: StateData;
  scenes?: Record<string, StateData>;
  chapters?: Record<string, StateData>;
}): StateAdapter {
  let story: StateData = initial?.story ?? {};
  const scenes: Record<string, StateData> = { ...(initial?.scenes ?? {}) };
  const chapters: Record<string, StateData> = { ...(initial?.chapters ?? {}) };

  return {
    getStory(path: string): unknown {
      return getAtPath(story, path);
    },
    setStory(path: string, value: unknown): void {
      story = setAtPath(story, path, value);
    },
    getScene(sceneId: string, path: string): unknown {
      const data = scenes[sceneId];
      if (data === undefined) return undefined;
      return getAtPath(data, path);
    },
    setScene(sceneId: string, path: string, value: unknown): void {
      scenes[sceneId] = setAtPath(scenes[sceneId] ?? {}, path, value);
    },
    getChapter(chapterId: string, path: string): unknown {
      const data = chapters[chapterId];
      if (data === undefined) return undefined;
      return getAtPath(data, path);
    },
    setChapter(chapterId: string, path: string, value: unknown): void {
      chapters[chapterId] = setAtPath(chapters[chapterId] ?? {}, path, value);
    },
    getAll(sceneId?: string, chapterId?: string): ProjectStateSnapshot {
      const sceneMap: Record<string, StateData> = {};
      if (sceneId !== undefined) {
        sceneMap[sceneId] = scenes[sceneId] ?? {};
      }
      const chapterMap: Record<string, StateData> = {};
      if (chapterId !== undefined) {
        chapterMap[chapterId] = chapters[chapterId] ?? {};
      }
      return { story, scenes: sceneMap, chapters: chapterMap };
    },
  };
}
