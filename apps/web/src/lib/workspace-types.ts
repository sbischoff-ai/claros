import type { WorkspaceDocument } from "./project-session";

export type SaveState = "saved" | "dirty" | "saving" | "error";
export type ProjectOpenState = "idle" | "opening" | "creating" | "connecting" | "open" | "error";
export type StorageBackendId = "file-picker" | "local-companion";
export type SidebarItemKind =
  | "section"
  | "chapter"
  | "folder"
  | "scene"
  | "note"
  | "add-chapter"
  | "add-scene";
export type TitleModalTarget =
  | "new-project"
  | "project"
  | "new-chapter"
  | "new-chapter-scene"
  | "new-scene"
  | "chapter"
  | "scene";
export type DeleteModalTarget = "chapter" | "scene";
export type WorkspaceFocusTarget =
  | { region: "editor"; path: string; cursor: number }
  | { region: "sidebar"; itemId: string };

export interface PaletteCommand {
  label: string;
  active?: boolean;
  disabled?: boolean;
  focusAfter?: "editor" | "sidebar" | "none";
  run(): void;
}

export interface SidebarItem {
  id: string;
  kind: SidebarItemKind;
  label: string;
  depth: number;
  collapsible: boolean;
  collapsed: boolean;
  path?: string;
  chapterId?: string;
}

export interface TitleModalState {
  target: TitleModalTarget;
  heading: string;
  value: string;
  placeholder: string;
  storageBackendId?: StorageBackendId;
  chapterTitle?: string;
  chapterId?: string;
  scenePath?: string;
  returnFocus?: WorkspaceFocusTarget;
}

export interface DeleteModalState {
  target: DeleteModalTarget;
  heading: string;
  label: string;
  chapterId?: string;
  scenePath?: string;
  confirmation: string;
}

export interface ContextMenuState {
  x: number;
  y: number;
  item: SidebarItem;
}

export type ActiveDocumentKind = WorkspaceDocument["kind"];
