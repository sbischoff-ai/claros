import { describe, it, expect } from "vitest";
import { parseMacro } from "../src/macro/parser.js";
import type { RollStep } from "../src/macro/types.js";

describe("parseMacro", () => {
  it("parses a minimal macro", () => {
    const yaml = `
id: test.minimal
name: "Minimal"
params:
  x:
    type: int
    source: user
    required: true
steps:
  - id: roll
    roll: 1d20
output:
  value: "steps.roll.total"
`;
    const macro = parseMacro(yaml);
    expect(macro.id).toBe("test.minimal");
    expect(macro.params.x.type).toBe("int");
    expect(macro.steps).toHaveLength(1);
    expect(macro.steps[0].id).toBe("roll");
    expect((macro.steps[0].body as RollStep).roll).toBe("1d20");
    expect(macro.output.value).toBe("steps.roll.total");
  });

  it("parses hooks", () => {
    const yaml = `
id: test.hooked
name: "Hooked"
hooks: [on_scene_start]
params: {}
steps: []
effects: []
output: {}
`;
    const macro = parseMacro(yaml);
    expect(macro.hooks).toEqual(["on_scene_start"]);
  });

  it("parses a when condition on a step", () => {
    const yaml = `
id: test.conditional
name: "Conditional"
params: {}
steps:
  - id: conditional-step
    when: "params.chaos > 5"
    roll: 1d6
effects: []
output: {}
`;
    const macro = parseMacro(yaml);
    expect(macro.steps[0].when).toBe("params.chaos > 5");
  });

  it("parses effects", () => {
    const yaml = `
id: test.with-effects
name: "With Effects"
params:
  val:
    type: int
    source: user
steps: []
effects:
  - set: state.story.test.counter
    value: "params.val + 1"
    when: "params.val > 0"
output: {}
`;
    const macro = parseMacro(yaml);
    expect(macro.effects).toHaveLength(1);
    expect(macro.effects[0].set).toBe("state.story.test.counter");
    expect(macro.effects[0].value).toBe("params.val + 1");
    expect(macro.effects[0].when).toBe("params.val > 0");
  });

  it("throws on missing id", () => {
    expect(() => parseMacro(`name: "No ID"\nparams: {}\nsteps: []\noutput: {}`)).toThrow();
  });
});
