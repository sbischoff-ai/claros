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

  it("parses nested output objects", () => {
    const yaml = `
id: test.nested-output
name: "Nested Output"
params: {}
steps:
  - id: roll
    roll: 1d6
output:
  result: "steps.roll.total"
  rolls:
    fate: "steps.roll.total"
`;

    const macro = parseMacro(yaml);
    expect(macro.output.result).toBe("steps.roll.total");
    expect(macro.output.rolls).toEqual({ fate: "steps.roll.total" });
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

  it("parses a markdown display template", () => {
    const yaml = `
id: test.display
name: "Display"
params: {}
steps: []
output:
  answer: '"yes"'
display:
  format: markdown
  title: "Test Display"
  template: |
    **Answer:** {{output.answer}}
`;

    const macro = parseMacro(yaml);
    expect(macro.display).toEqual({
      format: "markdown",
      title: "Test Display",
      template: "**Answer:** {{output.answer}}\n",
    });
  });

  it("rejects display templates with unsupported formats", () => {
    expect(() =>
      parseMacro(`
id: test.bad-display
name: "Bad Display"
params: {}
steps: []
output: {}
display:
  format: html
  template: "<p>No</p>"
`)
    ).toThrow(/display\.format/);
  });

  it("rejects display templates without template", () => {
    expect(() =>
      parseMacro(`
id: test.bad-display
name: "Bad Display"
params: {}
steps: []
output: {}
display:
  format: markdown
`)
    ).toThrow(/display\.template/);
  });

  it("rejects display templates containing Claros wrappers", () => {
    expect(() =>
      parseMacro(`
id: test.bad-display
name: "Bad Display"
params: {}
steps: []
output: {}
display:
  format: markdown
  template: |
    > [!claros] Bad
`)
    ).toThrow(/\[!claros\]/);

    expect(() =>
      parseMacro(`
id: test.bad-run-marker
name: "Bad Run Marker"
params: {}
steps: []
output: {}
display:
  format: markdown
  template: |
    [claros-run: 00001]
`)
    ).toThrow(/\[claros-run:/);
  });

  it("rejects invalid display interpolation and unsupported filters", () => {
    expect(() =>
      parseMacro(`
id: test.bad-expression
name: "Bad Expression"
params: {}
steps: []
output: {}
display:
  format: markdown
  template: "Result: {{ output. }}"
`)
    ).toThrow(/invalid expression/);

    expect(() =>
      parseMacro(`
id: test.bad-filter
name: "Bad Filter"
params: {}
steps: []
output: {}
display:
  format: markdown
  template: "Result: {{ output.answer | uppercase }}"
`)
    ).toThrow(/unsupported filter/);
  });

  it("rejects unsupported display directives", () => {
    expect(() =>
      parseMacro(`
id: test.bad-directive
name: "Bad Directive"
params: {}
steps: []
output: {}
display:
  format: markdown
  template: |
    {{#each output.items}}
    {{/each}}
`)
    ).toThrow(/unsupported directive/);
  });

  it("throws on missing id", () => {
    expect(() => parseMacro(`name: "No ID"\nparams: {}\nsteps: []\noutput: {}`)).toThrow();
  });
});
