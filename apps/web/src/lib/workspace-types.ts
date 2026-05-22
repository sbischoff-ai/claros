import type { WorkspaceDocument } from "./project-session";
import type { ManuscriptInsertionPlacement } from "@claros/story-state/browser";

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
  | "new-note"
  | "new-note-folder"
  | "move-note"
  | "chapter"
  | "scene";
export type DeleteModalTarget = "chapter" | "scene" | "note" | "note-folder";
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

export interface ActionMenuItem {
  label: string;
  disabled?: boolean;
  submenu?: ActionMenuItem[];
  run?: () => void;
}

export interface SidebarItem {
  id: string;
  kind: SidebarItemKind;
  label: string;
  depth: number;
  collapsible: boolean;
  collapsed: boolean;
  path?: string;
  folderPath?: string[];
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
  notePath?: string;
  folderPath?: string[];
  selectedFolderPath?: string;
  folderOptions?: Array<{ label: string; folderPath: string[] }>;
  hideValueInput?: boolean;
  createPlacement?: ManuscriptInsertionPlacement;
  targetChapterId?: string;
  targetScenePath?: string;
  returnFocus?: WorkspaceFocusTarget;
}

export interface DeleteModalState {
  target: DeleteModalTarget;
  heading: string;
  label: string;
  chapterId?: string;
  scenePath?: string;
  notePath?: string;
  folderPath?: string[];
  confirmation: string;
}

export interface ConfirmationModalState {
  heading: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm(): void;
}

export interface ContextMenuState {
  x: number;
  y: number;
  item: SidebarItem;
}

export type ActiveDocumentKind = WorkspaceDocument["kind"];
