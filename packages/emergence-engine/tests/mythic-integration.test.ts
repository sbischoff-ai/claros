import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createHookDispatcher,
  createInMemoryStateAdapter,
  createRegistry,
  executeMacro,
  fixedRNG,
  loadModuleFromDirectory,
} from "../src/index.js";
import type { UserPromptFn } from "../src/index.js";
import { FileStateAdapter } from "@claros/story-state";
import type { ModuleRegistry } from "../src/registry/types.js";
import type { StateAdapter } from "@claros/story-format";

const MODULE_DIR = fileURLToPath(new URL("../../../examples/mythic-gme-2e/", import.meta.url));
const TEST_SCENE_ID = "abandoned-temple";

describe("Mythic GME 2e integration", () => {
  let registry: ModuleRegistry;
  let state: StateAdapter;
  let tmpDir: string | undefined;

  const getMacro = (id: string) => {
    const macro = registry.getMacro(id);
    expect(macro).toBeDefined();
    return macro!;
  };

  beforeEach(async () => {
    registry = createRegistry();
    state = createInMemoryStateAdapter({
      scenes: { [TEST_SCENE_ID]: { mythic: { chaos_factor: 5 } } },
    });
    await loadModuleFromDirectory(MODULE_DIR, registry);
  });

  afterEach(async () => {
    if (tmpDir !== undefined) {
      await fs.rm(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("loads Mythic macros and tables from the filesystem module", () => {
    expect(registry.getMacro("mythic.fate-question")).toBeDefined();
    expect(registry.getMacro("mythic.scene-setup")).toBeDefined();
    expect(registry.getMacro("mythic.random-event-check")).toBeDefined();
    expect(registry.getTable("mythic.fate-chart")).toBeDefined();
  });

  describe("mythic.fate-question", () => {
    it("returns exceptional-yes for roll <= ey", async () => {
      const result = await executeMacro(
        getMacro("mythic.fate-question"),
        { intent: "Test?", odds: "likely" },
        registry,
        state,
        { sceneId: TEST_SCENE_ID },
        fixedRNG(2)
      );
      expect(result.output.result).toBe("exceptional-yes");
      expect(result.output.rolls).toEqual({ fate: 2 });
    });

    it("returns yes for ey < roll <= sy", async () => {
      const result = await executeMacro(
        getMacro("mythic.fate-question"),
        { intent: "Test?", odds: "likely" },
        registry,
        state,
        { sceneId: TEST_SCENE_ID },
        fixedRNG(40)
      );
      expect(result.output.result).toBe("yes");
    });

    it("returns no for sy < roll < en", async () => {
      const result = await executeMacro(
        getMacro("mythic.fate-question"),
        { intent: "Test?", odds: "likely" },
        registry,
        state,
        { sceneId: TEST_SCENE_ID },
        fixedRNG(80)
      );
      expect(result.output.result).toBe("no");
    });

    it("returns exceptional-no for roll >= en", async () => {
      const result = await executeMacro(
        getMacro("mythic.fate-question"),
        { intent: "Test?", odds: "likely" },
        registry,
        state,
        { sceneId: TEST_SCENE_ID },
        fixedRNG(97)
      );
      expect(result.output.result).toBe("exceptional-no");
    });

    it("reads chaos factor from scene state without prompting for it", async () => {
      let promptCalled = false;
      const fussyPrompt: UserPromptFn = async (param) => {
        if (param.prompt?.includes("Chaos")) {
          promptCalled = true;
        }
        return 5;
      };

      await executeMacro(
        getMacro("mythic.fate-question"),
        { intent: "Test?", odds: "likely" },
        registry,
        state,
        { sceneId: TEST_SCENE_ID },
        fixedRNG(40),
        fussyPrompt
      );

      expect(promptCalled).toBe(false);
    });

    it("triggers a random event for doubles whose digit is <= chaos factor", async () => {
      const result = await executeMacro(
        getMacro("mythic.fate-question"),
        { intent: "Test?", odds: "fifty-fifty" },
        registry,
        state,
        { sceneId: TEST_SCENE_ID },
        fixedRNG(44)
      );

      expect(result.output.random_event_triggered).toBe(true);
    });

    it("does not trigger a random event when the double digit exceeds chaos factor", async () => {
      const result = await executeMacro(
        getMacro("mythic.fate-question"),
        { intent: "Test?", odds: "fifty-fifty" },
        registry,
        state,
        { sceneId: TEST_SCENE_ID },
        fixedRNG(66)
      );

      expect(result.output.random_event_triggered).toBe(false);
    });

    it("never triggers a random event on 100 because double_digit is 10", async () => {
      const result = await executeMacro(
        getMacro("mythic.fate-question"),
        { intent: "Test?", odds: "fifty-fifty" },
        registry,
        state,
        { sceneId: TEST_SCENE_ID },
        fixedRNG(100)
      );

      expect(result.output.random_event_triggered).toBe(false);
    });

    it("does not trigger a random event on non-doubles", async () => {
      const result = await executeMacro(
        getMacro("mythic.fate-question"),
        { intent: "Test?", odds: "fifty-fifty" },
        registry,
        state,
        { sceneId: TEST_SCENE_ID },
        fixedRNG(43)
      );

      expect(result.output.random_event_triggered).toBe(false);
    });
  });

  describe("mythic.scene-setup", () => {
    it("decreases chaos factor when PCs were in control", async () => {
      const prompt: UserPromptFn = async () => true;

      await createHookDispatcher().dispatch(
        "on_scene_start",
        registry,
        state,
        { sceneId: TEST_SCENE_ID },
        undefined,
        prompt
      );

      expect(state.getScene(TEST_SCENE_ID, "mythic.chaos_factor")).toBe(4);
    });

    it("increases chaos factor when PCs were not in control", async () => {
      const prompt: UserPromptFn = async () => false;

      await createHookDispatcher().dispatch(
        "on_scene_start",
        registry,
        state,
        { sceneId: TEST_SCENE_ID },
        undefined,
        prompt
      );

      expect(state.getScene(TEST_SCENE_ID, "mythic.chaos_factor")).toBe(6);
    });

    it("does not decrease chaos factor below 1", async () => {
      state = createInMemoryStateAdapter({
        scenes: { [TEST_SCENE_ID]: { mythic: { chaos_factor: 1 } } },
      });

      await createHookDispatcher().dispatch(
        "on_scene_start",
        registry,
        state,
        { sceneId: TEST_SCENE_ID },
        undefined,
        async () => true
      );

      expect(state.getScene(TEST_SCENE_ID, "mythic.chaos_factor")).toBe(1);
    });

    it("does not increase chaos factor above 9", async () => {
      state = createInMemoryStateAdapter({
        scenes: { [TEST_SCENE_ID]: { mythic: { chaos_factor: 9 } } },
      });

      await createHookDispatcher().dispatch(
        "on_scene_start",
        registry,
        state,
        { sceneId: TEST_SCENE_ID },
        undefined,
        async () => false
      );

      expect(state.getScene(TEST_SCENE_ID, "mythic.chaos_factor")).toBe(9);
    });
  });

  it("persists updated chaos factor through FileStateAdapter", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "claros-mythic-test-"));

    const scenesDir = path.join(tmpDir, "state", "scenes");
    await fs.mkdir(scenesDir, { recursive: true });
    await fs.writeFile(
      path.join(scenesDir, `${TEST_SCENE_ID}.yaml`),
      "mythic:\n  chaos_factor: 5\n"
    );

    const fileState = new FileStateAdapter({ projectRoot: tmpDir });

    await createHookDispatcher().dispatch(
      "on_scene_start",
      registry,
      fileState,
      { sceneId: TEST_SCENE_ID },
      undefined,
      async () => true
    );

    const reloaded = new FileStateAdapter({ projectRoot: tmpDir });
    expect(reloaded.getScene(TEST_SCENE_ID, "mythic.chaos_factor")).toBe(4);
  });

  describe("fate chart spot checks", () => {
    const spotChecks: Array<{ odds: string; cf: number; roll: number; expected: string }> = [
      { odds: "impossible", cf: 1, roll: 1, expected: "yes" },
      { odds: "impossible", cf: 1, roll: 50, expected: "no" },
      { odds: "impossible", cf: 1, roll: 81, expected: "exceptional-no" },
      { odds: "fifty-fifty", cf: 5, roll: 2, expected: "exceptional-yes" },
      { odds: "fifty-fifty", cf: 5, roll: 50, expected: "yes" },
      { odds: "fifty-fifty", cf: 5, roll: 70, expected: "no" },
      { odds: "fifty-fifty", cf: 5, roll: 91, expected: "exceptional-no" },
      { odds: "certain", cf: 9, roll: 19, expected: "exceptional-yes" },
      { odds: "certain", cf: 9, roll: 99, expected: "yes" },
      { odds: "certain", cf: 9, roll: 100, expected: "exceptional-no" },
    ];

    it.each(spotChecks)("odds=$odds cf=$cf roll=$roll -> $expected", async (check) => {
      const localState = createInMemoryStateAdapter({
        scenes: { [TEST_SCENE_ID]: { mythic: { chaos_factor: check.cf } } },
      });

      const result = await executeMacro(
        getMacro("mythic.fate-question"),
        { intent: "Spot check?", odds: check.odds },
        registry,
        localState,
        { sceneId: TEST_SCENE_ID },
        fixedRNG(check.roll)
      );

      expect(result.output.result).toBe(check.expected);
    });
  });
});
