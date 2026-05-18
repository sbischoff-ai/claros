import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  EntityNotFoundError,
  getEntityState,
  setEntityState,
} from "../src/entity/state.js";

const dirs: string[] = [];

function makeProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claros-test-"));
  fs.mkdirSync(path.join(dir, "notes", "characters"), { recursive: true });
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("getEntityState", () => {
  it("reads the state block from a kebab-case slug note", async () => {
    const root = makeProject();

    fs.writeFileSync(
      path.join(root, "notes", "characters", "kareth.md"),
      "---\ntype: character\nstate:\n  hp: 12\n  max_hp: 15\n---\n\n# Kareth\n"
    );

    const state = await getEntityState("kareth", root);

    expect(state).toEqual({ hp: 12, max_hp: 15 });
  });

  it("reads a hyphenated entity slug", async () => {
    const root = makeProject();

    fs.writeFileSync(
      path.join(root, "notes", "characters", "the-priest.md"),
      "---\ntype: character\nstate:\n  hp: 8\n---\n\n# The Priest\n"
    );

    expect(await getEntityState("the-priest", root)).toEqual({ hp: 8 });
  });

  it("finds the note recursively under notes", async () => {
    const root = makeProject();

    fs.mkdirSync(path.join(root, "notes", "characters", "villains"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "notes", "characters", "villains", "the-priest.md"),
      "---\nstate:\n  hp: 8\n---\n\n# The Priest\n"
    );

    expect(await getEntityState("the-priest", root)).toEqual({ hp: 8 });
  });

  it("matches note filenames case-insensitively", async () => {
    const root = makeProject();

    fs.writeFileSync(
      path.join(root, "notes", "characters", "Kareth.md"),
      "---\nstate:\n  hp: 12\n---\n\n# Kareth\n"
    );

    expect(await getEntityState("kareth", root)).toEqual({ hp: 12 });
  });

  it("returns undefined when the note has no state key", async () => {
    const root = makeProject();

    fs.writeFileSync(
      path.join(root, "notes", "characters", "kareth.md"),
      "---\ntype: character\n---\n\n# Kareth\n"
    );

    expect(await getEntityState("kareth", root)).toBeUndefined();
  });

  it("returns undefined when the note does not exist", async () => {
    expect(await getEntityState("nonexistent", makeProject())).toBeUndefined();
  });
});

describe("setEntityState", () => {
  it("writes state to frontmatter, preserving other frontmatter and prose", async () => {
    const root = makeProject();
    const notePath = path.join(root, "notes", "characters", "kareth.md");

    fs.writeFileSync(
      notePath,
      "---\ntype: character\naliases: [the northern mercenary]\n---\n\n# Kareth\n\nProse.\n"
    );

    await setEntityState("kareth", root, { hp: 10, max_hp: 15 });

    const content = fs.readFileSync(notePath, "utf-8");

    expect(content).toContain("type: character");
    expect(content).toContain("aliases: [the northern mercenary]");
    expect(content).toContain("state:\n  hp: 10\n  max_hp: 15\n");
    expect(content).toContain("# Kareth\n\nProse.\n");
  });

  it("replaces an existing state block completely", async () => {
    const root = makeProject();

    fs.writeFileSync(
      path.join(root, "notes", "characters", "kareth.md"),
      "---\nstate:\n  hp: 12\n  old_key: removed\ntype: character\n---\n\n# Kareth\n"
    );

    await setEntityState("kareth", root, { hp: 8, max_hp: 15 });

    const state = await getEntityState("kareth", root);

    expect(state).toEqual({ hp: 8, max_hp: 15 });
    expect(state?.old_key).toBeUndefined();
  });

  it("round-trips setEntityState through getEntityState", async () => {
    const root = makeProject();

    fs.writeFileSync(
      path.join(root, "notes", "characters", "kareth.md"),
      "---\ntype: character\n---\n\n# Kareth\n"
    );

    const newState = { hp: 5, max_hp: 15, armor: 2 };
    await setEntityState("kareth", root, newState);

    expect(await getEntityState("kareth", root)).toEqual(newState);
  });

  it("preserves the body exactly when updating existing state", async () => {
    const root = makeProject();
    const notePath = path.join(root, "notes", "characters", "kareth.md");
    const body = "\n# Kareth\n\nBody text.\n- bullet\n";

    fs.writeFileSync(notePath, `---\nstate:\n  hp: 12\n---${body}`);

    await setEntityState("kareth", root, { hp: 9 });

    const content = fs.readFileSync(notePath, "utf-8");

    expect(content.endsWith(body)).toBe(true);
  });

  it("throws EntityNotFoundError when the note does not exist", async () => {
    await expect(setEntityState("nonexistent", makeProject(), { hp: 10 })).rejects.toThrow(
      EntityNotFoundError
    );
  });
});
