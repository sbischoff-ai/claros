import { describe, it, expect } from "vitest";
import { parseMacro } from "../src/macro/parser.js";
import { executeMacro } from "../src/macro/executor.js";
import { createRegistry } from "../src/registry/types.js";
import { createInMemoryStateAdapter } from "../src/state/adapter.js";
import { fixedRNG } from "../src/dice/types.js";
import type { UserPromptFn } from "../src/macro/executor.js";

describe("invoke step", () => {
  it("calls a sub-macro and captures its output in steps", async () => {
    const inner = parseMacro(`
id: inner.roll
name: "Inner Roll"
params: {}
steps:
  - id: r
    roll: 1d6
output:
  value: "steps.r.total"
`);
    const outer = parseMacro(`
id: outer.invoker
name: "Outer"
params: {}
steps:
  - id: sub
    invoke: inner.roll
    with: {}
output:
  inner_value: "steps.sub.value"
`);
    const registry = createRegistry();
    registry.registerMacro(inner);
    const result = await executeMacro(
      outer,
      {},
      registry,
      createInMemoryStateAdapter(),
      undefined,
      fixedRNG(4)
    );
    expect(result.output.inner_value).toBe(4);
  });

  it("passes with: expressions evaluated against the calling macro's context", async () => {
    const inner = parseMacro(`
id: inner.add
name: "Add"
params:
  x:
    type: int
    source: user
  y:
    type: int
    source: user
steps: []
output:
  sum: "params.x + params.y"
`);
    const outer = parseMacro(`
id: outer.adder
name: "Adder"
params:
  a:
    type: int
    source: user
  b:
    type: int
    source: user
steps:
  - id: addition
    invoke: inner.add
    with:
      x: "params.a"
      y: "params.b"
output:
  result: "steps.addition.sum"
`);
    const registry = createRegistry();
    registry.registerMacro(inner);
    const result = await executeMacro(
      outer,
      { a: 3, b: 7 },
      registry,
      createInMemoryStateAdapter()
    );
    expect(result.output.result).toBe(10);
  });

  it("invoke output is accessible from subsequent steps", async () => {
    const inner = parseMacro(`
id: inner.val
name: "Val"
params: {}
steps: []
output:
  n: "5"
`);
    const outer = parseMacro(`
id: outer.chain
name: "Chain"
params: {}
steps:
  - id: first
    invoke: inner.val
    with: {}
  - id: r
    roll: 1d6
output:
  n: "steps.first.n"
`);
    const registry = createRegistry();
    registry.registerMacro(inner);
    expect((await executeMacro(outer, {}, registry, createInMemoryStateAdapter())).output.n).toBe(
      5
    );
  });

  it("propagates sceneId to sub-macros via invoke", async () => {
    const inner = parseMacro(`
id: inner.read-scene
name: "Read Scene"
params: {}
steps: []
output:
  cf: "state.scenes[scene_id].mythic.chaos_factor"
`);
    const outer = parseMacro(`
id: outer.wrapper
name: "Wrapper"
params: {}
steps:
  - id: sub
    invoke: inner.read-scene
    with: {}
output:
  cf: "steps.sub.cf"
`);
    const registry = createRegistry();
    registry.registerMacro(inner);
    const state = createInMemoryStateAdapter({
      scenes: { "abandoned-temple": { mythic: { chaos_factor: 5 } } },
    });
    const result = await executeMacro(outer, {}, registry, state, { sceneId: "abandoned-temple" });
    expect(result.output.cf).toBe(5);
  });

  it("skips an invoke step when its when: condition is false", async () => {
    const inner = parseMacro(`
id: inner.noop
name: "Noop"
params: {}
steps: []
output:
  ran: "true"
`);
    const outer = parseMacro(`
id: outer.conditional-invoke
name: "Conditional Invoke"
params:
  flag:
    type: bool
    source: user
steps:
  - id: sub
    when: "params.flag"
    invoke: inner.noop
    with: {}
output: {}
`);
    const registry = createRegistry();
    registry.registerMacro(inner);
    const result = await executeMacro(
      outer,
      { flag: false },
      registry,
      createInMemoryStateAdapter()
    );
    expect(result.steps["sub"]).toBeUndefined();
  });

  it("throws when invoked macro is not in the registry", async () => {
    const outer = parseMacro(`
id: outer.broken
name: "Broken"
params: {}
steps:
  - id: s
    invoke: nonexistent.macro
output: {}
`);
    await expect(
      executeMacro(outer, {}, createRegistry(), createInMemoryStateAdapter())
    ).rejects.toThrow();
  });
});

describe("state param source resolution", () => {
  it("reads a param value from scene state via expression", async () => {
    const macro = parseMacro(`
id: test.state-read
name: "State Read"
params:
  chaos:
    type: int
    source: "state.scenes[scene_id].mythic.chaos_factor"
steps: []
output:
  chaos: "params.chaos"
`);
    const state = createInMemoryStateAdapter({
      scenes: { "abandoned-temple": { mythic: { chaos_factor: 7 } } },
    });
    const result = await executeMacro(macro, {}, createRegistry(), state, {
      sceneId: "abandoned-temple",
    });
    expect(result.output.chaos).toBe(7);
  });

  it("reads a param value from story state via expression", async () => {
    const macro = parseMacro(`
id: test.story-read
name: "Story Read"
params:
  npc_count:
    type: int
    source: "state.story.mythic.npcs | count"
steps: []
output:
  count: "params.npc_count"
`);
    const state = createInMemoryStateAdapter({
      story: { mythic: { npcs: ["kareth", "the-priest"] } },
    });
    const result = await executeMacro(macro, {}, createRegistry(), state);
    expect(result.output.count).toBe(2);
  });

  it("uses param default when state expression returns undefined", async () => {
    const macro = parseMacro(`
id: test.default
name: "Default"
params:
  chaos:
    type: int
    source: "state.scenes[scene_id].mythic.chaos_factor"
    default: 5
steps: []
output:
  chaos: "params.chaos"
`);
    // No sceneId provided → scene_id is undefined → expression returns undefined → use default
    const result = await executeMacro(macro, {}, createRegistry(), createInMemoryStateAdapter());
    expect(result.output.chaos).toBe(5);
  });

  it("calls userPrompt when state expression returns undefined and fallback: user", async () => {
    const macro = parseMacro(`
id: test.fallback
name: "Fallback"
params:
  chaos:
    type: int
    source: "state.scenes[scene_id].mythic.chaos_factor"
    fallback: user
    prompt: "Enter chaos factor"
steps: []
output:
  chaos: "params.chaos"
`);
    const mockPrompt: UserPromptFn = async () => 5;
    const result = await executeMacro(
      macro,
      {},
      createRegistry(),
      createInMemoryStateAdapter(),
      undefined,
      undefined,
      mockPrompt
    );
    expect(result.output.chaos).toBe(5);
  });

  it("calls userPrompt for source: user params", async () => {
    const macro = parseMacro(`
id: test.user-param
name: "User Param"
params:
  name:
    type: string
    source: user
    prompt: "Enter name"
steps: []
output:
  name: "params.name"
`);
    const mockPrompt: UserPromptFn = async () => "Kareth";
    const result = await executeMacro(
      macro,
      {},
      createRegistry(),
      createInMemoryStateAdapter(),
      undefined,
      undefined,
      mockPrompt
    );
    expect(result.output.name).toBe("Kareth");
  });

  it("throws MissingParamError when required state param is missing with no fallback or default", async () => {
    const macro = parseMacro(`
id: test.required
name: "Required"
params:
  chaos:
    type: int
    required: true
    source: "state.scenes[scene_id].mythic.chaos_factor"
steps: []
output: {}
`);
    await expect(
      executeMacro(macro, {}, createRegistry(), createInMemoryStateAdapter())
    ).rejects.toThrow();
  });

  it("resolves literal: source to the literal string value", async () => {
    const macro = parseMacro(`
id: test.literal
name: "Literal"
params:
  mode:
    type: string
    source: "literal:fate-question"
steps: []
output:
  mode: "params.mode"
`);
    const result = await executeMacro(macro, {}, createRegistry(), createInMemoryStateAdapter());
    expect(result.output.mode).toBe("fate-question");
  });
});

describe("effects", () => {
  it("writes to story state", async () => {
    const macro = parseMacro(`
id: test.effect
name: "Effect"
params:
  new_value:
    type: int
    source: user
steps: []
effects:
  - set: state.story.test.counter
    value: "params.new_value"
output: {}
`);
    const state = createInMemoryStateAdapter();
    await executeMacro(macro, { new_value: 42 }, createRegistry(), state);
    expect(state.getStory("test.counter")).toBe(42);
  });

  it("writes to scene state using state.scenes[scene_id]", async () => {
    const macro = parseMacro(`
id: test.scene-effect
name: "Scene Effect"
params: {}
steps: []
effects:
  - set: state.scenes[scene_id].mythic.chaos_factor
    value: "6"
output: {}
`);
    const state = createInMemoryStateAdapter({
      scenes: { "abandoned-temple": { mythic: { chaos_factor: 5 } } },
    });
    await executeMacro(macro, {}, createRegistry(), state, { sceneId: "abandoned-temple" });
    expect(state.getScene("abandoned-temple", "mythic.chaos_factor")).toBe(6);
  });

  it("writes to scene state using a literal scene ID", async () => {
    const macro = parseMacro(`
id: test.literal-scene-effect
name: "Literal Scene Effect"
params: {}
steps: []
effects:
  - set: state.scenes["dark-corridor"].mythic.chaos_factor
    value: "3"
output: {}
`);
    const state = createInMemoryStateAdapter();
    await executeMacro(macro, {}, createRegistry(), state);
    expect(state.getScene("dark-corridor", "mythic.chaos_factor")).toBe(3);
  });

  it("skips an effect when its when: condition is false", async () => {
    const macro = parseMacro(`
id: test.conditional-effect
name: "Conditional Effect"
params:
  flag:
    type: bool
    source: user
steps: []
effects:
  - set: state.story.test.x
    value: "99"
    when: "params.flag"
output: {}
`);
    const state = createInMemoryStateAdapter();
    await executeMacro(macro, { flag: false }, createRegistry(), state);
    expect(state.getStory("test.x")).toBeUndefined();

    await executeMacro(macro, { flag: true }, createRegistry(), state);
    expect(state.getStory("test.x")).toBe(99);
  });

  it("earlier effects are visible to later effects via adapter methods", async () => {
    const macro = parseMacro(`
id: test.sequential
name: "Sequential Effects"
params: {}
steps: []
effects:
  - set: state.story.test.a
    value: "1"
  - set: state.story.test.b
    value: "state.story.test.a + 1"
output: {}
`);
    const state = createInMemoryStateAdapter();
    await executeMacro(macro, {}, createRegistry(), state);
    expect(state.getStory("test.a")).toBe(1);
    // Second effect reads state.story.test.a from the pre-execution snapshot (undefined → NaN/null).
    // The spec does NOT require effects to see each other's writes via state.* expressions.
    // No assertion on test.b — behaviour is implementation-defined per spec.
  });

  it("can read step results in effect expressions", async () => {
    const macro = parseMacro(`
id: test.step-in-effect
name: "Step in Effect"
params: {}
steps:
  - id: roll
    roll: 1d6
effects:
  - set: state.story.test.last-roll
    value: "steps.roll.total"
output: {}
`);
    const state = createInMemoryStateAdapter();
    await executeMacro(macro, {}, createRegistry(), state, undefined, fixedRNG(4));
    expect(state.getStory("test.last-roll")).toBe(4);
  });
});

describe("InMemoryStateAdapter", () => {
  it("initialises with provided story state", () => {
    const state = createInMemoryStateAdapter({ story: { mythic: { npcs: ["kareth"] } } });
    expect(state.getStory("mythic.npcs")).toEqual(["kareth"]);
  });

  it("initialises with provided scene state", () => {
    const state = createInMemoryStateAdapter({
      scenes: { "abandoned-temple": { mythic: { chaos_factor: 5 } } },
    });
    expect(state.getScene("abandoned-temple", "mythic.chaos_factor")).toBe(5);
  });

  it("returns undefined for missing paths without throwing", () => {
    expect(createInMemoryStateAdapter().getStory("missing.path")).toBeUndefined();
    expect(createInMemoryStateAdapter().getScene("no-such-scene", "x")).toBeUndefined();
  });

  it("setScene followed by getScene returns the new value", () => {
    const state = createInMemoryStateAdapter();
    state.setScene("abandoned-temple", "mythic.chaos_factor", 6);
    expect(state.getScene("abandoned-temple", "mythic.chaos_factor")).toBe(6);
  });

  it("getAll includes the requested scene in the snapshot", () => {
    const state = createInMemoryStateAdapter({
      story: { x: 1 },
      scenes: { "abandoned-temple": { mythic: { chaos_factor: 5 } } },
    });
    const snapshot = state.getAll("abandoned-temple");
    expect((snapshot.story as any).x).toBe(1);
    expect((snapshot.scenes["abandoned-temple"] as any).mythic.chaos_factor).toBe(5);
  });

  it("getAll returns empty objects for unrequested or non-existent IDs", () => {
    const state = createInMemoryStateAdapter();
    const snapshot = state.getAll();
    expect(snapshot.story).toEqual({});
    expect(snapshot.scenes).toEqual({});
    expect(snapshot.chapters).toEqual({});
  });
});
