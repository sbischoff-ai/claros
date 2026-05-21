import FolderOpen from "phosphor-svelte/lib/FolderOpen";
import TerminalWindow from "phosphor-svelte/lib/TerminalWindow";

import type { StorageBackendId } from "./workspace-types";

export interface StorageBackendOption {
  id: StorageBackendId;
  label: string;
  icon: typeof FolderOpen;
  available: boolean;
  unavailableReason?: string;
}

export function buildStorageBackendOptions(localProjectSupported: boolean): StorageBackendOption[] {
  return [
    {
      id: "file-picker",
      label: "Local Folder",
      icon: FolderOpen,
      available: localProjectSupported,
      unavailableReason: localProjectSupported ? undefined : "Not supported by this browser",
    },
    {
      id: "local-companion",
      label: "Local Companion",
      icon: TerminalWindow,
      available: true,
    },
  ];
}
