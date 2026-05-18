import { load } from "js-yaml";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parseTableFile } from "@claros/story-format";
import { parseMacro } from "../macro/parser.js";
import type { ModuleRegistry } from "./types.js";

interface ModuleManifest {
  id: string;
  name: string;
  version: string;
  macros?: string[];
  tables?: string[];
}

function parseModuleManifest(yaml: string, manifestPath: string): ModuleManifest {
  const raw = load(yaml);

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`module manifest must be a YAML object: ${manifestPath}`);
  }

  const manifest = raw as Record<string, unknown>;

  if (typeof manifest.id !== "string" || manifest.id.length === 0) {
    throw new Error(`module manifest missing required field 'id': ${manifestPath}`);
  }
  if (typeof manifest.name !== "string" || manifest.name.length === 0) {
    throw new Error(`module manifest missing required field 'name': ${manifestPath}`);
  }
  if (typeof manifest.version !== "string" || manifest.version.length === 0) {
    throw new Error(`module manifest missing required field 'version': ${manifestPath}`);
  }

  const readPathList = (key: "macros" | "tables"): string[] | undefined => {
    const value = manifest[key];
    if (value === undefined) {
      return undefined;
    }
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
      throw new Error(
        `module manifest field '${key}' must be an array of strings: ${manifestPath}`
      );
    }
    return value as string[];
  };

  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    macros: readPathList("macros"),
    tables: readPathList("tables"),
  };
}

export async function loadModuleFromDirectory(
  directory: string,
  registry: ModuleRegistry
): Promise<void> {
  const manifestPath = path.join(directory, "module.yaml");
  const manifest = parseModuleManifest(await fs.readFile(manifestPath, "utf-8"), manifestPath);

  for (const macroPath of manifest.macros ?? []) {
    const fullPath = path.join(directory, macroPath);
    const macro = parseMacro(await fs.readFile(fullPath, "utf-8"));
    registry.registerMacro(macro);
  }

  for (const tablePath of manifest.tables ?? []) {
    const fullPath = path.join(directory, tablePath);
    const table = await parseTableFile(fullPath);
    registry.registerTable(table);
  }
}
