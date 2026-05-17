import type { StateAdapter } from "@claros/story-format";
import type { RNG } from "../dice/types.js";
import type { MacroInvocationContext } from "../macro/context.js";
import type { UserPromptFn } from "../macro/executor.js";
import type { ModuleRegistry } from "../registry/types.js";
import { executeMacro } from "../macro/executor.js";

export type HookName =
  | "on_project_open"
  | "on_story_start"
  | "on_story_end"
  | "on_chapter_start"
  | "on_chapter_end"
  | "on_scene_start"
  | "on_scene_end"
  | "on_character_create";

export interface HookDispatcher {
  dispatch(
    hook: HookName,
    registry: ModuleRegistry,
    state: StateAdapter,
    invocationContext?: MacroInvocationContext,
    rng?: RNG,
    userPrompt?: UserPromptFn
  ): Promise<void>;
}

export function createHookDispatcher(): HookDispatcher {
  return {
    async dispatch(
      hook: HookName,
      registry: ModuleRegistry,
      state: StateAdapter,
      invocationContext?: MacroInvocationContext,
      rng?: RNG,
      userPrompt?: UserPromptFn
    ): Promise<void> {
      const macros = registry.getMacrosByHook(hook);
      for (const macro of macros) {
        await executeMacro(macro, {}, registry, state, invocationContext, rng, userPrompt);
      }
    },
  };
}
