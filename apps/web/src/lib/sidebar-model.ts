import type { WorkspaceChapter, WorkspaceNote, WorkspaceNoteFolder } from "./project-session";
import type { SidebarItem } from "./workspace-types";

export function buildSidebarItems(
  chapterList: WorkspaceChapter[],
  noteList: WorkspaceNote[],
  noteFolderList: WorkspaceNoteFolder[],
  collapsed: Set<string>,
  optimisticChapters: Map<string, string>,
  optimisticScenes: Map<string, string>
): SidebarItem[] {
  const items: SidebarItem[] = [
    {
      id: "manuscript",
      kind: "section",
      label: "Manuscript",
      depth: 0,
      collapsible: true,
      collapsed: collapsed.has("manuscript"),
    },
  ];

  if (!collapsed.has("manuscript")) {
    for (const chapter of chapterList) {
      const chapterId = `chapter:${chapter.id}`;
      items.push({
        id: chapterId,
        kind: "chapter",
        label: optimisticChapters.get(chapter.id) ?? chapter.title ?? `Chapter ${chapter.sequence}`,
        depth: 1,
        collapsible: true,
        collapsed: collapsed.has(chapterId),
        chapterId: chapter.id,
      });

      if (!collapsed.has(chapterId)) {
        for (const scene of chapter.scenes) {
          items.push({
            id: scene.path,
            kind: "scene",
            label: optimisticScenes.get(scene.path) ?? scene.title ?? `Scene ${scene.sequence}`,
            depth: 2,
            collapsible: false,
            collapsed: false,
            path: scene.path,
            chapterId: chapter.id,
          });
        }

        if (chapter.id === chapterList.at(-1)?.id) {
          items.push({
            id: "action:add-scene:append",
            kind: "add-scene",
            label: "Add Scene",
            depth: 2,
            collapsible: false,
            collapsed: false,
            chapterId: chapter.id,
          });
        }
      }
    }

    items.push({
      id: "action:add-chapter:append",
      kind: "add-chapter",
      label: "Add Chapter",
      depth: 1,
      collapsible: false,
      collapsed: false,
    });
  }

  items.push({
    id: "notes",
    kind: "section",
    label: "Notes",
    depth: 0,
    collapsible: true,
    collapsed: collapsed.has("notes"),
  });

  if (!collapsed.has("notes")) {
    appendNoteItems(items, noteList, noteFolderList, [], 1, collapsed);
  }

  return items;
}

function appendNoteItems(
  items: SidebarItem[],
  noteList: WorkspaceNote[],
  noteFolderList: WorkspaceNoteFolder[],
  folderPath: string[],
  depth: number,
  collapsed: Set<string>
): void {
  const childFolderNames = Array.from(
    new Set(
      noteFolderList
        .filter((note) => startsWithPath(note.folderPath, folderPath))
        .map((folder) => folder.folderPath[folderPath.length])
        .filter((folderName): folderName is string => folderName !== undefined)
    )
  ).sort(compareNormalizedTitle);

  for (const folderName of childFolderNames) {
    const nextFolderPath = [...folderPath, folderName];
    const folderId = `folder:${nextFolderPath.join("/")}`;
    items.push({
      id: folderId,
      kind: "folder",
      label: titleFromSlug(folderName),
      depth,
      collapsible: true,
      collapsed: collapsed.has(folderId),
      folderPath: nextFolderPath,
    });

    if (!collapsed.has(folderId)) {
      appendNoteItems(items, noteList, noteFolderList, nextFolderPath, depth + 1, collapsed);
    }
  }

  noteList
    .filter((note) => pathsEqual(note.folderPath, folderPath))
    .sort((left, right) => compareNormalizedTitle(left.title, right.title))
    .forEach((note) => {
      items.push({
        id: note.path,
        kind: "note",
        label: note.title,
        depth,
        collapsible: false,
        collapsed: false,
        path: note.path,
      });
    });
}

function compareNormalizedTitle(left: string, right: string): number {
  return slugForSort(left).localeCompare(slugForSort(right));
}

function slugForSort(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function startsWithPath(path: string[], prefix: string[]): boolean {
  return prefix.every((part, index) => path[index] === part);
}

function pathsEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && startsWithPath(left, right);
}

function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}
