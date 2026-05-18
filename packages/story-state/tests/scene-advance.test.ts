import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { parseStateFile, serializeStateFile } from "@claros/story-format";
import { advanceScene } from "../src/state/scene.js";

const dirs: string[] = [];

function makeProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claros-test-"));
  fs.mkdirSync(path.join(dir, "state", "scenes"), { recursive: true });
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("advanceScene", () => {
  it("copies source scene state to the new scene file", async () => {
    const root = makeProject();

    fs.writeFileSync(
      path.join(root, "state", "scenes", "abandoned-temple.yaml"),
      serializeStateFile({ data: { mythic: { chaos_factor: 5, scene_type: "expected" } } })
    );

    await advanceScene({
      projectRoot: root,
      fromSceneId: "abandoned-temple",
      toSceneId: "dark-corridor",
    });

    const newScene = parseStateFile(
      fs.readFileSync(path.join(root, "state", "scenes", "dark-corridor.yaml"), "utf-8")
    );

    expect(newScene.data).toEqual({
      mythic: { chaos_factor: 5, scene_type: "expected" },
    });
  });

  it("does not modify the source scene file", async () => {
    const root = makeProject();

    fs.writeFileSync(
      path.join(root, "state", "scenes", "abandoned-temple.yaml"),
      serializeStateFile({ data: { mythic: { chaos_factor: 5 } } })
    );

    await advanceScene({
      projectRoot: root,
      fromSceneId: "abandoned-temple",
      toSceneId: "dark-corridor",
    });

    const original = parseStateFile(
      fs.readFileSync(path.join(root, "state", "scenes", "abandoned-temple.yaml"), "utf-8")
    );

    expect(original.data).toEqual({ mythic: { chaos_factor: 5 } });
  });

  it("creates a new scene with empty state when the source file does not exist", async () => {
    const root = makeProject();

    await advanceScene({
      projectRoot: root,
      fromSceneId: "abandoned-temple",
      toSceneId: "dark-corridor",
    });

    const newScene = parseStateFile(
      fs.readFileSync(path.join(root, "state", "scenes", "dark-corridor.yaml"), "utf-8")
    );

    expect(newScene.data).toEqual({});
  });

  it("creates parent directories for the new file if they do not exist", async () => {
    const root = makeProject();

    fs.rmSync(path.join(root, "state", "scenes"), { recursive: true, force: true });

    await advanceScene({
      projectRoot: root,
      fromSceneId: "abandoned-temple",
      toSceneId: "dark-corridor",
    });

    expect(fs.existsSync(path.join(root, "state", "scenes", "dark-corridor.yaml"))).toBe(true);
  });
});
