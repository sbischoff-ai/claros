import type { ClarosProject, DocumentRef, LinkResolution } from "./workspace.js";
import type {
  ChapterRef,
  MarkdownDocument,
  NoteFolderRef,
  NoteRef,
  ProjectManifest,
  SceneRef,
} from "@claros/story-format";

export interface WorkspaceManifest {
  title: string;
}

export interface WorkspaceChapter {
  kind: "chapter";
  id: string;
  sequence: number;
  title: string;
  scenes: WorkspaceScene[];
}

export interface WorkspaceScene {
  kind: "scene";
  id: string;
  chapterId: string;
  sequence: number;
  title: string;
  path: string;
}

export interface WorkspaceNote {
  kind: "note";
  id: string;
  path: string;
  title: string;
  folderPath: string[];
}

export interface WorkspaceNoteFolder {
  kind: "note-folder";
  id: string;
  path: string;
  title: string;
  folderPath: string[];
}

export type WorkspaceDocumentRef = WorkspaceScene | WorkspaceNote | DocumentRef;

export interface WorkspaceDocument {
  path: string;
  raw: string;
  body: string;
  title: string;
  kind: "scene" | "note";
}

export interface WorkspaceProjectSummary {
  manifest: WorkspaceManifest;
  chapters: WorkspaceChapter[];
  notes: WorkspaceNote[];
  noteFolders: WorkspaceNoteFolder[];
}

export type WorkspaceLinkResolution =
  | { status: "resolved"; path: string; reason: string }
  | { status: "ambiguous"; target: string; candidates: WorkspaceNote[]; reason: string }
  | { status: "unresolved"; target: string };

export function summarizeWorkspaceProject(project: ClarosProject): WorkspaceProjectSummary {
  const scenesByChapter = new Map<string, WorkspaceScene[]>();
  for (const scene of project.listScenes()) {
    const scenes = scenesByChapter.get(scene.chapterId) ?? [];
    scenes.push(toWorkspaceScene(scene));
    scenesByChapter.set(scene.chapterId, scenes);
  }

  return {
    manifest: toWorkspaceManifest(project.manifest),
    chapters: project
      .listChapters()
      .map((chapter) => toWorkspaceChapter(chapter, scenesByChapter.get(chapter.id) ?? [])),
    notes: project.listNotes().map(toWorkspaceNote),
    noteFolders: project.listNoteFolders().map(toWorkspaceNoteFolder),
  };
}

export function toWorkspaceManifest(manifest: ProjectManifest): WorkspaceManifest {
  return {
    title: typeof manifest.title === "string" && manifest.title.trim() ? manifest.title : "Claros",
  };
}

export function toWorkspaceChapter(
  chapter: ChapterRef,
  scenes: WorkspaceScene[] = []
): WorkspaceChapter {
  return {
    kind: "chapter",
    id: chapter.id,
    sequence: chapter.sequence,
    title: chapter.title || `Chapter ${chapter.sequence}`,
    scenes,
  };
}

export function toWorkspaceScene(scene: SceneRef): WorkspaceScene {
  return {
    kind: "scene",
    id: scene.id,
    chapterId: scene.chapterId,
    sequence: scene.sequence,
    title: scene.title || `Scene ${scene.sequence}`,
    path: scene.path,
  };
}

export function toWorkspaceNote(note: NoteRef): WorkspaceNote {
  return {
    kind: "note",
    id: note.path,
    path: note.path,
    title: note.title || titleFromSlug(note.slug),
    folderPath: note.path.startsWith("notes/")
      ? note.path.slice("notes/".length).split("/").slice(0, -1)
      : [],
  };
}

export function toWorkspaceNoteFolder(folder: NoteFolderRef): WorkspaceNoteFolder {
  return {
    kind: "note-folder",
    id: folder.path,
    path: folder.path,
    title: titleFromSlug(folder.name),
    folderPath: [...folder.folderPath],
  };
}

export function toWorkspaceDocument(
  project: ClarosProject,
  document: MarkdownDocument
): WorkspaceDocument {
  const scene = project.listScenes().find((candidate) => candidate.path === document.path);
  if (scene !== undefined) {
    return {
      path: document.path,
      raw: document.raw,
      body: document.body,
      title: scene.title || `Scene ${scene.sequence}`,
      kind: "scene",
    };
  }

  const note = project.listNotes().find((candidate) => candidate.path === document.path);
  return {
    path: document.path,
    raw: document.raw,
    body: document.body,
    title: note?.title || document.path,
    kind: "note",
  };
}

export function toWorkspaceLinkResolution(resolution: LinkResolution): WorkspaceLinkResolution {
  if (resolution.status === "resolved") {
    return { status: "resolved", path: resolution.path, reason: resolution.reason };
  }
  if (resolution.status === "ambiguous") {
    return {
      status: "ambiguous",
      target: resolution.target,
      reason: resolution.reason,
      candidates: resolution.candidates.map(toWorkspaceNote),
    };
  }
  return { status: "unresolved", target: resolution.target };
}

export function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}
