import type { DiceExpression } from "./types.js";

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseError";
  }
}

export function parseDice(expression: string): DiceExpression {
  const match = expression.match(/^(\d+)d(\d+)(?:([+-]\d+))?(?:(kh|kl)(\d+))?(>=(\d+))?(!)?$/);

  if (!match) {
    throw new ParseError(`Invalid dice expression: ${expression}`);
  }

  const count = Number.parseInt(match[1], 10);
  const sides = Number.parseInt(match[2], 10);

  if (count < 1) {
    throw new ParseError("Dice count must be at least 1");
  }

  if (sides < 2) {
    throw new ParseError("Dice sides must be at least 2");
  }

  const modifier = match[3] ? Number.parseInt(match[3], 10) : 0;
  const keepType = match[4];
  const keepCount = match[5] ? Number.parseInt(match[5], 10) : undefined;
  const thresholdValue = match[7] ? Number.parseInt(match[7], 10) : undefined;
  const hasExplode = Boolean(match[8]);

  if (keepType && thresholdValue !== undefined) {
    throw new ParseError("Keep and threshold are mutually exclusive");
  }

  const result: DiceExpression = {
    count,
    sides,
    modifier,
  };

  if (keepType && keepCount !== undefined) {
    result.keep = keepType === "kh" ? { highest: keepCount } : { lowest: keepCount };
  }

  if (thresholdValue !== undefined) {
    result.threshold = { gte: thresholdValue };
  }

  if (hasExplode) {
    result.explode = true;
  }

  return result;
}
