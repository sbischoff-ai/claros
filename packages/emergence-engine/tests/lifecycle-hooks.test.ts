import { describe, it, expect } from "vitest";
import { parseMacro } from "../src/macro/parser.js";
import { createRegistry } from "../src/registry/types.js";
import { createHookDispatcher } from "../src/hooks/types.js";
import { createInMemoryStateAdapter } from "../src/state/adapter.js";
import type { UserPromptFn } from "../src/macro/executor.js";

describe("lifecycle hooks", () => {
  it("dispatches on_scene_start and propagates sceneId to macros", async () => {
    const setupMacro = parseMacro(`
id: mythic.scene-setup
name: "Scene Setup"
hooks: [on_scene_start]
params:
  pcs_in_control:
    type: bool
    source: user
    prompt: "Were PCs in control?"
    default: true
steps: []
effects:
  - set: state.scenes[scene_id].mythic.chaos_factor
    value: "state.scenes[scene_id].mythic.chaos_factor - 1"
    when: "params.pcs_in_control and state.scenes[scene_id].mythic.chaos_factor > 1"
  - set: state.scenes[scene_id].mythic.chaos_factor
    value: "state.scenes[scene_id].mythic.chaos_factor + 1"
    when: "(not params.pcs_in_control) and state.scenes[scene_id].mythic.chaos_factor < 9"
output: {}
`);
    const registry = createRegistry();
    registry.registerMacro(setupMacro);

    const state = createInMemoryStateAdapter({
      scenes: { "abandoned-temple": { mythic: { chaos_factor: 5 } } },
    });
    const mockPrompt: UserPromptFn = async () => true; // PCs in control → CF decreases

    await createHookDispatcher().dispatch(
      "on_scene_start",
      registry,
      state,
      { sceneId: "abandoned-temple" },
      undefined,
      mockPrompt
    );
    expect(state.getScene("abandoned-temple", "mythic.chaos_factor")).toBe(4);
  });

  it("dispatches to all macros registered for a hook, in registration order", async () => {
    const macro1 = parseMacro(`
id: test.hook1
name: "Hook 1"
hooks: [on_scene_end]
params: {}
steps: []
effects:
  - set: state.story.test.ran1
    value: "true"
output: {}
`);
    const macro2 = parseMacro(`
id: test.hook2
name: "Hook 2"
hooks: [on_scene_end]
params: {}
steps: []
effects:
  - set: state.story.test.ran2
    value: "true"
output: {}
`);
    const registry = createRegistry();
    registry.registerMacro(macro1);
    registry.registerMacro(macro2);

    const state = createInMemoryStateAdapter();
    await createHookDispatcher().dispatch("on_scene_end", registry, state);

    expect(state.getStory("test.ran1")).toBe(true);
    expect(state.getStory("test.ran2")).toBe(true);
  });

  it("does not invoke macros registered for a different hook", async () => {
    const macro = parseMacro(`
id: test.wrong-hook
name: "Wrong Hook"
hooks: [on_chapter_start]
params: {}
steps: []
effects:
  - set: state.story.test.ran
    value: "true"
output: {}
`);
    const registry = createRegistry();
    registry.registerMacro(macro);

    const state = createInMemoryStateAdapter();
    await createHookDispatcher().dispatch("on_scene_start", registry, state);
    expect(state.getStory("test.ran")).toBeUndefined();
  });
});
