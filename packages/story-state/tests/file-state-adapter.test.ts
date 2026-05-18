import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { parseStateFile, serializeStateFile } from "@claros/story-format";
import { FileStateAdapter } from "../src/state/adapter.js";

const dirs: string[] = [];

function makeProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claros-test-"));
  fs.mkdirSync(path.join(dir, "state", "scenes"), { recursive: true });
  fs.mkdirSync(path.join(dir, "state", "chapters"), { recursive: true });
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("story scope", () => {
  it("returns undefined for a missing path when no state file exists", () => {
    expect(new FileStateAdapter({ projectRoot: makeProject() }).getStory("x")).toBeUndefined();
  });

  it("setStory creates the file; getStory returns the value", () => {
    const root = makeProject();
    const adapter = new FileStateAdapter({ projectRoot: root });

    adapter.setStory("mythic.npcs", ["kareth", "the-priest"]);

    expect(adapter.getStory("mythic.npcs")).toEqual(["kareth", "the-priest"]);
    expect(fs.existsSync(path.join(root, "state", "story.yaml"))).toBe(true);
  });

  it("persists across adapter instances", () => {
    const root = makeProject();

    new FileStateAdapter({ projectRoot: root }).setStory("x", 7);

    expect(new FileStateAdapter({ projectRoot: root }).getStory("x")).toBe(7);
  });

  it("setStory preserves sibling keys", () => {
    const root = makeProject();
    const adapter = new FileStateAdapter({ projectRoot: root });

    adapter.setStory("mythic.chaos_factor", 5);
    adapter.setStory("mythic.npcs", ["kareth"]);

    expect(adapter.getStory("mythic.chaos_factor")).toBe(5);
    expect(adapter.getStory("mythic.npcs")).toEqual(["kareth"]);
  });

  it("in-memory cache is updated immediately on set", () => {
    const root = makeProject();
    const adapter = new FileStateAdapter({ projectRoot: root });

    adapter.setStory("x", 1);
    adapter.setStory("x", 2);

    expect(adapter.getStory("x")).toBe(2);
  });

  it("reads a pre-existing state file", () => {
    const root = makeProject();

    fs.writeFileSync(
      path.join(root, "state", "story.yaml"),
      serializeStateFile({ data: { mythic: { npcs: ["kareth"] } } })
    );

    expect(new FileStateAdapter({ projectRoot: root }).getStory("mythic.npcs")).toEqual(["kareth"]);
  });
});

describe("scene scope", () => {
  it("reads from the named scene file", () => {
    const root = makeProject();

    fs.writeFileSync(
      path.join(root, "state", "scenes", "abandoned-temple.yaml"),
      serializeStateFile({ data: { mythic: { chaos_factor: 6 } } })
    );

    const adapter = new FileStateAdapter({ projectRoot: root });

    expect(adapter.getScene("abandoned-temple", "mythic.chaos_factor")).toBe(6);
  });

  it("writes to the named scene file", () => {
    const root = makeProject();

    new FileStateAdapter({ projectRoot: root }).setScene(
      "abandoned-temple",
      "mythic.chaos_factor",
      4
    );

    const written = parseStateFile(
      fs.readFileSync(path.join(root, "state", "scenes", "abandoned-temple.yaml"), "utf-8")
    );

    expect((written.data.mythic as { chaos_factor?: number }).chaos_factor).toBe(4);
  });

  it("returns undefined for a non-existent scene and does not throw", () => {
    expect(
      new FileStateAdapter({ projectRoot: makeProject() }).getScene("no-such-scene", "x")
    ).toBeUndefined();
  });

  it("different scene IDs are independent", () => {
    const root = makeProject();
    const adapter = new FileStateAdapter({ projectRoot: root });

    adapter.setScene("abandoned-temple", "mythic.chaos_factor", 5);
    adapter.setScene("dark-corridor", "mythic.chaos_factor", 3);

    expect(adapter.getScene("abandoned-temple", "mythic.chaos_factor")).toBe(5);
    expect(adapter.getScene("dark-corridor", "mythic.chaos_factor")).toBe(3);
  });
});

describe("chapter scope", () => {
  it("reads and writes chapter state independently", () => {
    const root = makeProject();
    const adapter = new FileStateAdapter({ projectRoot: root });

    adapter.setChapter("chapter-01", "example.route", "north");
    adapter.setChapter("chapter-02", "example.route", "south");

    expect(adapter.getChapter("chapter-01", "example.route")).toBe("north");
    expect(adapter.getChapter("chapter-02", "example.route")).toBe("south");
  });

  it("returns undefined for a missing chapter", () => {
    expect(
      new FileStateAdapter({ projectRoot: makeProject() }).getChapter("chapter-01", "x")
    ).toBeUndefined();
  });
});

describe("getAll", () => {
  it("includes the requested scene in the snapshot", () => {
    const root = makeProject();
    const adapter = new FileStateAdapter({ projectRoot: root });

    adapter.setStory("x", 1);
    adapter.setScene("abandoned-temple", "mythic.chaos_factor", 5);

    const snapshot = adapter.getAll("abandoned-temple");

    expect(snapshot.story).toEqual({ x: 1 });
    expect(snapshot.scenes).toEqual({
      "abandoned-temple": { mythic: { chaos_factor: 5 } },
    });
    expect(snapshot.chapters).toEqual({});
  });

  it("includes the requested chapter in the snapshot", () => {
    const root = makeProject();
    const adapter = new FileStateAdapter({ projectRoot: root });

    adapter.setChapter("chapter-01", "example.route", "north");

    const snapshot = adapter.getAll(undefined, "chapter-01");

    expect(snapshot.story).toEqual({});
    expect(snapshot.scenes).toEqual({});
    expect(snapshot.chapters).toEqual({
      "chapter-01": { example: { route: "north" } },
    });
  });

  it("returns empty maps for scopes with no data when no IDs requested", () => {
    const snapshot = new FileStateAdapter({ projectRoot: makeProject() }).getAll();

    expect(snapshot.story).toEqual({});
    expect(snapshot.scenes).toEqual({});
    expect(snapshot.chapters).toEqual({});
  });

  it("returns empty state data for missing named files", () => {
    const snapshot = new FileStateAdapter({ projectRoot: makeProject() }).getAll(
      "missing-scene",
      "chapter-01"
    );

    expect(snapshot.scenes).toEqual({ "missing-scene": {} });
    expect(snapshot.chapters).toEqual({ "chapter-01": {} });
  });
});
