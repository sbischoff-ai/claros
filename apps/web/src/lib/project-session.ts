export const PROJECT_STORAGE_KEY = "claros.web.project.v1";

export interface ProjectStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

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

export type WorkspaceDocumentRef = WorkspaceScene | WorkspaceNote | { path: string };

export interface WorkspaceDocument {
  path: string;
  raw: string;
  body: string;
  title: string;
  kind: "scene" | "note";
}

export interface ProjectSessionSnapshot {
  manifest: WorkspaceManifest;
  chapters: WorkspaceChapter[];
  notes: WorkspaceNote[];
  documents: Record<string, string>;
}

export interface ProjectSession {
  readonly manifest: WorkspaceManifest;
  listChapters(): WorkspaceChapter[];
  listScenes(): WorkspaceScene[];
  listNotes(): WorkspaceNote[];
  readDocument(ref: WorkspaceDocumentRef): WorkspaceDocument;
  writeDocument(ref: WorkspaceDocumentRef, raw: string): ProjectSessionSnapshot;
  snapshot(): ProjectSessionSnapshot;
}

const sampleProject: ProjectSessionSnapshot = {
  manifest: {
    title: "The Abandoned Temple",
  },
  chapters: [
    {
      kind: "chapter",
      id: "01-threshold",
      sequence: 1,
      title: "Threshold",
      scenes: [
        {
          kind: "scene",
          id: "01-threshold/01-broken-arch",
          chapterId: "01-threshold",
          sequence: 1,
          title: "Broken Arch",
          path: "manuscript/01-threshold/01-broken-arch.md",
        },
        {
          kind: "scene",
          id: "01-threshold/02-nave",
          chapterId: "01-threshold",
          sequence: 2,
          title: "Scene 2",
          path: "manuscript/01-threshold/02-nave.md",
        },
      ],
    },
    {
      kind: "chapter",
      id: "02-below",
      sequence: 2,
      title: "Chapter 2",
      scenes: [
        {
          kind: "scene",
          id: "02-below/01-stairs",
          chapterId: "02-below",
          sequence: 1,
          title: "The Stairs Below",
          path: "manuscript/02-below/01-stairs.md",
        },
      ],
    },
  ],
  notes: [
    {
      kind: "note",
      id: "notes/characters/kareth.md",
      path: "notes/characters/kareth.md",
      title: "Kareth",
      folderPath: ["characters"],
    },
    {
      kind: "note",
      id: "notes/characters/the-priest.md",
      path: "notes/characters/the-priest.md",
      title: "The Priest",
      folderPath: ["characters"],
    },
    {
      kind: "note",
      id: "notes/places/ancient-ruin.md",
      path: "notes/places/ancient-ruin.md",
      title: "Ancient Ruin",
      folderPath: ["places"],
    },
  ],
  documents: {
    "manuscript/01-threshold/01-broken-arch.md": [
      "---",
      "title: Broken Arch",
      "---",
      "",
      "# Threshold",
      "",
      "## Broken Arch",
      "",
      "Rain whispered through the broken arch.",
      "",
      "Kareth paused at the threshold, one hand on the old iron latch. Somewhere beyond the nave, stone shifted against stone.",
      "",
      "He thought of [[The Priest]] and the warning she had refused to explain.",
    ].join("\n"),
    "manuscript/01-threshold/02-nave.md": [
      "# Threshold",
      "",
      "## Scene 2",
      "",
      "The nave smelled of cold ash and wet stone.",
    ].join("\n"),
    "manuscript/02-below/01-stairs.md": [
      "# Chapter 2",
      "",
      "## The Stairs Below",
      "",
      "The stairwell descended beyond the reach of the lantern.",
    ].join("\n"),
    "notes/characters/kareth.md": [
      "---",
      "title: Kareth",
      "tags:",
      "  - character",
      "---",
      "",
      "# Kareth",
      "",
      "A cautious mercenary who trusts old warnings more than new promises.",
    ].join("\n"),
    "notes/characters/the-priest.md": [
      "---",
      "title: The Priest",
      "aliases:",
      "  - the warning priest",
      "---",
      "",
      "# The Priest",
      "",
      "She knows what the temple was before it became a ruin.",
    ].join("\n"),
    "notes/places/ancient-ruin.md": [
      "---",
      "title: Ancient Ruin",
      "tags:",
      "  - place",
      "---",
      "",
      "# Ancient Ruin",
      "",
      "A temple complex older than the road that leads to it.",
    ].join("\n"),
  },
};

export function loadProjectSession(storage: ProjectStorage): ProjectSession {
  const storedProject = storage.getItem(PROJECT_STORAGE_KEY);
  if (storedProject === null) {
    const snapshot = cloneSnapshot(sampleProject);
    storage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(snapshot));
    return createProjectSession(snapshot, storage);
  }

  try {
    return createProjectSession(normalizeSnapshot(JSON.parse(storedProject)), storage);
  } catch {
    const snapshot = cloneSnapshot(sampleProject);
    storage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(snapshot));
    return createProjectSession(snapshot, storage);
  }
}

export function firstDocumentPath(session: ProjectSession): string {
  return session.listScenes()[0]?.path ?? session.listNotes()[0]?.path ?? "";
}

export function documentPath(ref: WorkspaceDocumentRef): string {
  return ref.path;
}

function createProjectSession(
  initialSnapshot: ProjectSessionSnapshot,
  storage: ProjectStorage
): ProjectSession {
  let currentSnapshot = cloneSnapshot(initialSnapshot);

  function persist(): void {
    storage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(currentSnapshot));
  }

  return {
    manifest: currentSnapshot.manifest,
    listChapters(): WorkspaceChapter[] {
      return cloneSnapshot(currentSnapshot).chapters;
    },
    listScenes(): WorkspaceScene[] {
      return currentSnapshot.chapters.flatMap((chapter) =>
        chapter.scenes.map((scene) => ({
          ...scene,
        }))
      );
    },
    listNotes(): WorkspaceNote[] {
      return currentSnapshot.notes.map((note) => ({ ...note, folderPath: [...note.folderPath] }));
    },
    readDocument(ref: WorkspaceDocumentRef): WorkspaceDocument {
      const path = documentPath(ref);
      const raw = currentSnapshot.documents[path] ?? "";
      const { body } = splitFrontmatter(raw);
      const scene = currentSnapshot.chapters
        .flatMap((chapter) => chapter.scenes)
        .find((candidate) => candidate.path === path);
      if (scene !== undefined) {
        return { path, raw, body, title: scene.title, kind: "scene" };
      }

      const note = currentSnapshot.notes.find((candidate) => candidate.path === path);
      return { path, raw, body, title: note?.title ?? path, kind: "note" };
    },
    writeDocument(ref: WorkspaceDocumentRef, raw: string): ProjectSessionSnapshot {
      const path = documentPath(ref);
      const previousRaw = currentSnapshot.documents[path] ?? "";
      const nextRaw = mergeBodyWithExistingFrontmatter(previousRaw, raw);
      currentSnapshot = {
        ...currentSnapshot,
        documents: {
          ...currentSnapshot.documents,
          [path]: nextRaw,
        },
      };
      persist();
      return cloneSnapshot(currentSnapshot);
    },
    snapshot(): ProjectSessionSnapshot {
      return cloneSnapshot(currentSnapshot);
    },
  };
}

function normalizeSnapshot(value: unknown): ProjectSessionSnapshot {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return cloneSnapshot(sampleProject);
  }

  const candidate = value as Partial<ProjectSessionSnapshot>;
  if (
    typeof candidate.manifest !== "object" ||
    candidate.manifest === null ||
    !Array.isArray(candidate.chapters) ||
    !Array.isArray(candidate.notes) ||
    typeof candidate.documents !== "object" ||
    candidate.documents === null
  ) {
    return cloneSnapshot(sampleProject);
  }

  return cloneSnapshot(candidate as ProjectSessionSnapshot);
}

function splitFrontmatter(raw: string): { frontmatter: string; body: string } {
  if (!raw.startsWith("---\n") && !raw.startsWith("---\r\n")) {
    return { frontmatter: "", body: raw };
  }

  const match = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n)?(?:\r?\n)?/.exec(raw);
  if (match === null) {
    return { frontmatter: "", body: raw };
  }

  return {
    frontmatter: match[0],
    body: raw.slice(match[0].length),
  };
}

function mergeBodyWithExistingFrontmatter(previousRaw: string, body: string): string {
  const { frontmatter } = splitFrontmatter(previousRaw);
  if (frontmatter.length === 0) {
    return body;
  }

  return `${frontmatter}${body}`;
}

function cloneSnapshot(snapshot: ProjectSessionSnapshot): ProjectSessionSnapshot {
  return {
    manifest: { ...snapshot.manifest },
    chapters: snapshot.chapters.map((chapter) => ({
      ...chapter,
      scenes: chapter.scenes.map((scene) => ({ ...scene })),
    })),
    notes: snapshot.notes.map((note) => ({ ...note, folderPath: [...note.folderPath] })),
    documents: { ...snapshot.documents },
  };
}
