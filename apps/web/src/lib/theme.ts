import { DEFAULT_CLAROS_THEME_ID, isClarosThemeId, type ClarosThemeId } from "@claros/editor-core";

export const THEME_STORAGE_KEY = "claros.theme";

export interface ThemeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadTheme(storage: ThemeStorage): ClarosThemeId {
  const storedTheme = storage.getItem(THEME_STORAGE_KEY);
  return storedTheme && isClarosThemeId(storedTheme) ? storedTheme : DEFAULT_CLAROS_THEME_ID;
}

export function saveTheme(storage: ThemeStorage, themeId: ClarosThemeId): void {
  storage.setItem(THEME_STORAGE_KEY, themeId);
}
