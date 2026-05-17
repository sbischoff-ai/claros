import type { StateData } from "./types.js";

/**
 * Read a value at a dot-separated path.
 * Returns undefined for missing segments; never throws.
 */
export function getAtPath(data: StateData, path: string): unknown {
  const segments = path.split(".");
  let current: unknown = data;
  for (const segment of segments) {
    if (current === null || current === undefined || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/**
 * Return a new StateData with the value at path set. Creates intermediate objects as needed.
 * Never mutates the original (pure function).
 */
export function setAtPath(data: StateData, path: string, value: unknown): StateData {
  const segments = path.split(".");
  return setAtSegments(data, segments, value) as StateData;
}

function setAtSegments(
  current: unknown,
  segments: string[],
  value: unknown
): unknown {
  if (segments.length === 0) {
    return value;
  }
  const [head, ...rest] = segments;
  const obj: Record<string, unknown> =
    current !== null && current !== undefined && typeof current === "object" && !Array.isArray(current)
      ? { ...(current as Record<string, unknown>) }
      : {};
  obj[head] = setAtSegments(obj[head], rest, value);
  return obj;
}
