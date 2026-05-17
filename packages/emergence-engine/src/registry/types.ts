import type { AnyTable } from "@claros/story-format";
import type { MacroDefinition } from "../macro/types.js";
import type { HookName } from "../hooks/types.js";

export interface ModuleRegistry {
  getMacro(id: string): MacroDefinition | undefined;
  getTable(id: string): AnyTable | undefined;
  registerMacro(macro: MacroDefinition): void;
  registerTable(table: AnyTable): void;
  getMacrosByHook(hookName: HookName): MacroDefinition[];
}

export function createRegistry(): ModuleRegistry {
  const macros = new Map<string, MacroDefinition>();
  const tables = new Map<string, AnyTable>();

  return {
    getMacro(id: string): MacroDefinition | undefined {
      return macros.get(id);
    },
    getTable(id: string): AnyTable | undefined {
      return tables.get(id);
    },
    registerMacro(macro: MacroDefinition): void {
      macros.set(macro.id, macro);
    },
    registerTable(table: AnyTable): void {
      tables.set(table.id, table);
    },
    getMacrosByHook(hookName: HookName): MacroDefinition[] {
      return [...macros.values()].filter((m) => m.hooks?.includes(hookName) ?? false);
    },
  };
}
