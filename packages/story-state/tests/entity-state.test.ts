import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  NoteNotFoundError,
  getNoteFrontmatter,
  getNoteFrontmatterPath,
  setNoteFrontmatter,
  setNoteFrontmatterPath,
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

describe("getNoteFrontmatter", () => {
  it("reads frontmatter by note slug", async () => {
    const root = makeProject();

    fs.writeFileSync(
      path.join(root, "notes", "characters", "kareth.md"),
      "---\ntitle: Kareth\nosr:\n  hp:\n    current: 12\n    max: 15\n---\n\n# Kareth\n"
    );

    const frontmatter = await getNoteFrontmatter("kareth", root);

    expect(frontmatter?.title).toBe("Kareth");
    expect(frontmatter?.osr).toEqual({ hp: { current: 12, max: 15 } });
  });

  it("returns undefined when the note does not exist", async () => {
    expect(await getNoteFrontmatter("nonexistent", makeProject())).toBeUndefined();
  });
});

describe("setNoteFrontmatter", () => {
  it("writes frontmatter and preserves markdown body exactly", async () => {
    const root = makeProject();
    const notePath = path.join(root, "notes", "characters", "kareth.md");
    const body = "\n# Kareth\n\nBody text.\n- bullet\n";

    fs.writeFileSync(notePath, `---\ntitle: Kareth\nosr:\n  hp:\n    current: 12\n---${body}`);

    await setNoteFrontmatter("kareth", root, {
      title: "Kareth",
      tags: ["mercenary"],
      osr: { hp: { current: 9, max: 15 } },
      mythic: { status: "interrupted" },
    });

    const content = fs.readFileSync(notePath, "utf-8");
    expect(content.endsWith(body)).toBe(true);
    expect(content).toContain("mythic:");
    expect(content).toContain("status: interrupted");
  });

  it("throws NoteNotFoundError when the note does not exist", async () => {
    await expect(
      setNoteFrontmatter("nonexistent", makeProject(), { title: "Missing" })
    ).rejects.toThrow(NoteNotFoundError);
  });
});

describe("getNoteFrontmatterPath", () => {
  it("reads arbitrary dot paths without implicit state prefix", async () => {
    const root = makeProject();

    fs.writeFileSync(
      path.join(root, "notes", "characters", "kareth.md"),
      "---\ntitle: Kareth\nosr:\n  hp:\n    current: 12\n    max: 15\nmythic:\n  status: interrupted\n---\n\n# Kareth\n"
    );

    expect(await getNoteFrontmatterPath("kareth", root, "title")).toBe("Kareth");
    expect(await getNoteFrontmatterPath("kareth", root, "osr.hp.current")).toBe(12);
    expect(await getNoteFrontmatterPath("kareth", root, "mythic.status")).toBe("interrupted");
    expect(await getNoteFrontmatterPath("kareth", root, "state.hp")).toBeUndefined();
  });

  it("treats a literal top-level state key as ordinary frontmatter", async () => {
    const root = makeProject();

    fs.writeFileSync(
      path.join(root, "notes", "characters", "kareth.md"),
      "---\nstate:\n  hp: 12\nosr:\n  hp:\n    current: 10\n---\n\n# Kareth\n"
    );

    expect(await getNoteFrontmatterPath("kareth", root, "state.hp")).toBe(12);
    expect(await getNoteFrontmatterPath("kareth", root, "osr.hp.current")).toBe(10);
  });
});

describe("setNoteFrontmatterPath", () => {
  it("sets arbitrary dot paths and preserves unknown keys", async () => {
    const root = makeProject();
    const notePath = path.join(root, "notes", "characters", "kareth.md");

    fs.writeFileSync(
      notePath,
      "---\ntitle: Kareth\ncustom_flag: true\nosr:\n  hp:\n    current: 12\n---\n\n# Kareth\n"
    );

    await setNoteFrontmatterPath("kareth", root, "osr.hp.max", 15);
    await setNoteFrontmatterPath("kareth", root, "mythic.status", "interrupted");

    expect(await getNoteFrontmatterPath("kareth", root, "osr.hp.current")).toBe(12);
    expect(await getNoteFrontmatterPath("kareth", root, "osr.hp.max")).toBe(15);
    expect(await getNoteFrontmatterPath("kareth", root, "mythic.status")).toBe("interrupted");
    expect(await getNoteFrontmatterPath("kareth", root, "custom_flag")).toBe(true);

    const content = fs.readFileSync(notePath, "utf-8");
    expect(content).toContain("custom_flag: true");
  });

  it("supports setting top-level keys like title", async () => {
    const root = makeProject();

    fs.writeFileSync(path.join(root, "notes", "characters", "kareth.md"), "# Kareth\n");

    await setNoteFrontmatterPath("kareth", root, "title", "Kareth");

    expect(await getNoteFrontmatterPath("kareth", root, "title")).toBe("Kareth");
  });

  it("throws NoteNotFoundError when the note does not exist", async () => {
    await expect(
      setNoteFrontmatterPath("nonexistent", makeProject(), "osr.hp.current", 10)
    ).rejects.toThrow(NoteNotFoundError);
  });
});
