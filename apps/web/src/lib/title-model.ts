import type { WorkspaceChapter, WorkspaceScene } from "./project-session";

export function normalizedProjectTitle(title: string): string {
  const normalized = title.trim();
  return normalized.length > 0 ? normalized : "Untitled Project";
}

export function normalizedChapterTitle(
  chapterId: string,
  title: string,
  chapters: WorkspaceChapter[]
): string {
  const normalized = title.trim();
  if (normalized.length > 0) {
    return normalized;
  }
  const chapter = chapters.find((candidate) => candidate.id === chapterId);
  return `Chapter ${chapter?.sequence ?? 1}`;
}

export function normalizedSceneTitle(
  scenePath: string,
  title: string,
  scenes: WorkspaceScene[]
): string {
  const normalized = title.trim();
  if (normalized.length > 0) {
    return normalized;
  }
  const scene = scenes.find((candidate) => candidate.path === scenePath);
  return `Scene ${scene?.sequence ?? 1}`;
}
