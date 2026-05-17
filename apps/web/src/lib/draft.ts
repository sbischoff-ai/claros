import { defaultMarkdown } from "@claros/editor-core";

export const DRAFT_STORAGE_KEY = "claros.web.draft.v1";

export interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadDraft(storage: DraftStorage): string {
  return storage.getItem(DRAFT_STORAGE_KEY) ?? defaultMarkdown;
}

export function saveDraft(storage: DraftStorage, markdown: string): void {
  storage.setItem(DRAFT_STORAGE_KEY, markdown);
}
