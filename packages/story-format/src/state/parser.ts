import { load, dump } from "js-yaml";
import type { StateFile, StateData } from "./types.js";

/**
 * Parse a state YAML file string into a StateFile.
 * Returns empty data for blank/whitespace-only input.
 */
export function parseStateFile(yaml: string): StateFile {
  if (!yaml || yaml.trim().length === 0) {
    return { data: {} };
  }
  const parsed = load(yaml);
  if (parsed === null || parsed === undefined) {
    return { data: {} };
  }
  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    return { data: {} };
  }
  return { data: parsed as StateData };
}

/**
 * Serialize a StateFile back to a YAML string.
 */
export function serializeStateFile(file: StateFile): string {
  return dump(file.data, { lineWidth: -1 });
}
