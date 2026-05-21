import { describe, expect, it } from "vitest";
import { parseMacro, renderMacroDisplay } from "../src/index.js";

describe("renderMacroDisplay", () => {
  it("renders template interpolation from params, steps, output, context, and run", () => {
    const macro = parseMacro(`
id: test.display
name: "Display Macro"
params: {}
steps: []
output: {}
display:
  format: markdown
  title: "Custom Title"
  template: |
    Intent: {{params.intent}}
    Roll: {{steps.fate-roll.total}}
    Result: {{output.result | title}}
    Document: {{context.document}}
    Run: {{run.id}}
`);

    const display = renderMacroDisplay({
      macro,
      result: {
        params: { intent: "Does it work?" },
        steps: { "fate-roll": { total: 42 } },
        output: { result: "exceptional-yes" },
        effects: [],
      },
      run: { id: "00042", createdAt: "2026-05-21T00:00:00.000Z" },
      documentContext: {
        document: "manuscript/01-prologue/01-opening.md",
        sceneId: "01-prologue/01-opening",
        chapterId: "01-prologue",
      },
    });

    expect(display).toEqual({
      format: "markdown",
      title: "Custom Title",
      body: [
        "Intent: Does it work?",
        "Roll: 42",
        "Result: Exceptional Yes",
        "Document: manuscript/01-prologue/01-opening.md",
        "Run: 00042",
      ].join("\n"),
    });
  });

  it("renders minimal conditional blocks", () => {
    const macro = parseMacro(`
id: test.conditional-display
name: "Conditional Display"
params: {}
steps: []
output: {}
display:
  format: markdown
  template: |
    Result: {{output.result}}
    {{#if output.random_event}}
    Random event: {{output.random_event.focus}}
    {{/if}}
`);

    expect(
      renderMacroDisplay({
        macro,
        result: {
          params: {},
          steps: {},
          output: { result: "yes", random_event: { focus: "NPC action" } },
          effects: [],
        },
        run: { id: "00042", createdAt: "2026-05-21T00:00:00.000Z" },
      }).body
    ).toContain("Random event: NPC action");

    expect(
      renderMacroDisplay({
        macro,
        result: { params: {}, steps: {}, output: { result: "yes" }, effects: [] },
        run: { id: "00043", createdAt: "2026-05-21T00:00:00.000Z" },
      }).body
    ).not.toContain("Random event:");
  });

  it("renders json filters", () => {
    const macro = parseMacro(`
id: test.json-display
name: "JSON Display"
params: {}
steps: []
output: {}
display:
  format: markdown
  template: "Data: {{output.payload | json}}"
`);

    expect(
      renderMacroDisplay({
        macro,
        result: { params: {}, steps: {}, output: { payload: { a: 1 } }, effects: [] },
        run: { id: "00042", createdAt: "2026-05-21T00:00:00.000Z" },
      }).body
    ).toBe('Data: {"a":1}');
  });

  it("uses a generic fallback when no display template is present", () => {
    const macro = parseMacro(`
id: test.fallback
name: "Fallback Macro"
params: {}
steps:
  - id: fate-roll
    roll: 1d100
output:
  answer: '"yes"'
`);

    const display = renderMacroDisplay({
      macro,
      result: {
        params: { intent: "Fallback?" },
        steps: { "fate-roll": { total: 42 } },
        output: { answer: "yes" },
        effects: [],
      },
      run: { id: "00042", createdAt: "2026-05-21T00:00:00.000Z" },
    });

    expect(display.title).toBe("Fallback Macro");
    expect(display.body).toContain("**Intent:** Fallback?");
    expect(display.body).toContain("`1d100 -> 42`");
    expect(display.body).toContain("**Answer:** yes");
  });
});
