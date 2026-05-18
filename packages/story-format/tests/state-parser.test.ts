import { describe, it, expect } from "vitest";
import { parseStateFile, serializeStateFile } from "../src/state/parser.js";
import type { StateFile } from "../src/state/types.js";

type WeightedListEntry = Record<string, unknown> & {
  weight?: number;
  active?: boolean;
};

describe("parseStateFile", () => {
  it("parses a simple state file", () => {
    const file = parseStateFile("mythic:\n  chaos_factor: 5\n");
    expect((file.data.mythic as any).chaos_factor).toBe(5);
  });

  it("parses multiple module namespaces", () => {
    const file = parseStateFile("mythic:\n  chaos_factor: 5\nironsworn:\n  momentum: 3\n");
    expect((file.data.mythic as any).chaos_factor).toBe(5);
    expect((file.data.ironsworn as any).momentum).toBe(3);
  });

  it("parses a nested list", () => {
    const yaml = `
mythic:
  threads:
    - name: "The Conspiracy"
      status: active
`;
    const file = parseStateFile(yaml);
    const threads = (file.data.mythic as any).threads as any[];
    expect(threads).toHaveLength(1);
    expect(threads[0].name).toBe("The Conspiracy");
  });

  it("parses an empty or whitespace-only string as empty data", () => {
    expect(parseStateFile("").data).toEqual({});
    expect(parseStateFile("   ").data).toEqual({});
  });

  it("round-trips through serialize and parse without data loss", () => {
    const original: StateFile = {
      data: {
        mythic: { chaos_factor: 5, npcs: ["kareth", "the-priest"] },
        ironsworn: { momentum: 3 },
      },
    };
    const roundTripped = parseStateFile(serializeStateFile(original));
    expect(roundTripped.data).toEqual(original.data);
  });
});

describe("generic weighted-list entries in state YAML (ADR-022 Delta A)", () => {
  it("parses module-namespaced weighted-list arrays without changing their payload shape", () => {
    const yaml = `
example:
  lists:
    targets:
      - name: North Gate
        weight: 3
        active: true
        kind: location
      - name: Rusted Beacon
        kind: landmark
      - name: Closed Archive
        active: false
`;
    const file = parseStateFile(yaml);
    const targets = (file.data.example as any).lists.targets as WeightedListEntry[];
    expect(targets).toHaveLength(3);
    expect(targets[0]).toEqual({
      name: "North Gate",
      weight: 3,
      active: true,
      kind: "location",
    });
    expect(targets[1]).toMatchObject({ name: "Rusted Beacon", kind: "landmark" });
    expect(targets[1].weight).toBeUndefined();
    expect(targets[1].active).toBeUndefined();
    expect(targets[2]).toMatchObject({ name: "Closed Archive", active: false });
  });

  it("parses additional generic weighted-list arrays", () => {
    const yaml = `
example:
  lists:
    obstacles:
      - name: Locked Door
        weight: 2
      - name: Broken Bridge
`;
    const file = parseStateFile(yaml);
    const obstacles = (file.data.example as any).lists.obstacles as WeightedListEntry[];
    expect(obstacles).toHaveLength(2);
    expect(obstacles[0].name).toBe("Locked Door");
    expect(obstacles[0].weight).toBe(2);
    expect(obstacles[1].name).toBe("Broken Bridge");
    expect(obstacles[1].weight).toBeUndefined();
  });

  it("preserves arbitrary payload fields alongside generic selection metadata", () => {
    const yaml = `
example:
  lists:
    routes:
      - name: River Road
        difficulty: 2
        active: true
      - name: Old Tunnel
        difficulty: 5
        active: false
`;
    const file = parseStateFile(yaml);
    const routes = (file.data.example as any).lists.routes as WeightedListEntry[];
    expect(routes).toHaveLength(2);
    expect(routes[0]).toEqual({ name: "River Road", difficulty: 2, active: true });
    expect(routes[1]).toEqual({ name: "Old Tunnel", difficulty: 5, active: false });
  });

  it("weighted-list entries do not contain range", () => {
    const yaml = `
example:
  lists:
    targets:
      - name: North Gate
        weight: 1
`;
    const file = parseStateFile(yaml);
    const targets = (file.data.example as any).lists.targets as WeightedListEntry[];
    expect((targets[0] as any).range).toBeUndefined();
  });

  it("round-trips generic weighted-list arrays without data loss", () => {
    const original: StateFile = {
      data: {
        example: {
          lists: {
            targets: [
              { name: "North Gate", weight: 3, active: true, kind: "location" },
              { name: "Rusted Beacon", kind: "landmark" },
            ],
            obstacles: [{ name: "Locked Door", weight: 2 }],
            routes: [{ name: "River Road", difficulty: 2, active: true }],
          },
          priority: 5,
        },
      },
    };
    const roundTripped = parseStateFile(serializeStateFile(original));
    expect(roundTripped.data).toEqual(original.data);
  });
});
