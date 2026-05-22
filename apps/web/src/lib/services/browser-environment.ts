import type { BrowserDirectoryPicker, DirectoryHandle } from "$lib/browser-file-system";
import type { ProjectStorage } from "$lib/project-session";

export class BrowserEnvironment {
  get storage(): ProjectStorage {
    return window.localStorage;
  }

  get currentUrl(): URL {
    return new URL(window.location.href);
  }

  get activeElement(): Element | null {
    return document.activeElement;
  }

  canPickLocalDirectory(): boolean {
    return typeof (window as Window & BrowserDirectoryPicker).showDirectoryPicker === "function";
  }

  async pickWritableDirectory(): Promise<DirectoryHandle> {
    const picker = window as Window & BrowserDirectoryPicker;
    if (picker.showDirectoryPicker === undefined) {
      throw new Error("Local folder access is not supported in this browser.");
    }
    return picker.showDirectoryPicker({ mode: "readwrite" });
  }

  prompt(label: string, value = ""): string | null {
    return window.prompt(label, value);
  }

  querySelector<T extends Element>(selector: string): T | null {
    return document.querySelector<T>(selector);
  }

  addWindowListener<K extends keyof WindowEventMap>(
    type: K,
    listener: (event: WindowEventMap[K]) => void
  ): () => void {
    window.addEventListener(type, listener);
    return () => window.removeEventListener(type, listener);
  }
}

export function createBrowserEnvironment(): BrowserEnvironment {
  return new BrowserEnvironment();
}
