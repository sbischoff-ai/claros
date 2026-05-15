import { parseDice } from "./parser.js";
import type { DiceExpression, RollResult, RNG } from "./types.js";
import { defaultRNG } from "./types.js";

function sum(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}

export function rollDice(expr: DiceExpression | string, rng: RNG = defaultRNG): RollResult {
  const parsed = typeof expr === "string" ? parseDice(expr) : expr;

  const rolls: number[] = [];
  let kept: number[] = [];
  let total = 0;

  if (parsed.explode) {
    for (let i = 0; i < parsed.count; i += 1) {
      let roll: number;
      do {
        roll = rng(1, parsed.sides);
        rolls.push(roll);
      } while (roll === parsed.sides);
    }

    kept = [...rolls];
    total = sum(kept) + parsed.modifier;
  } else {
    for (let i = 0; i < parsed.count; i += 1) {
      rolls.push(rng(1, parsed.sides));
    }

    if (parsed.threshold) {
      kept = rolls.filter((value) => value >= parsed.threshold!.gte);
      total = kept.length + parsed.modifier;
    } else if (parsed.keep?.highest !== undefined) {
      kept = [...rolls].sort((a, b) => b - a).slice(0, parsed.keep.highest);
      total = sum(kept) + parsed.modifier;
    } else if (parsed.keep?.lowest !== undefined) {
      kept = [...rolls].sort((a, b) => a - b).slice(0, parsed.keep.lowest);
      total = sum(kept) + parsed.modifier;
    } else {
      kept = [...rolls];
      total = sum(kept) + parsed.modifier;
    }
  }

  const result: RollResult = {
    total,
    rolls,
    kept,
    modifier: parsed.modifier,
  };

  if (parsed.sides === 100) {
    result.is_double = total % 11 === 0 || total === 100;
    result.double_digit = total === 100 ? 10 : Math.floor(total / 11);
  }

  return result;
}
