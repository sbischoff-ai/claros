export interface DiceExpression {
  count: number;
  sides: number;
  modifier: number;
  keep?: {
    highest?: number;
    lowest?: number;
  };
  threshold?: {
    gte: number;
  };
  explode?: boolean;
}

export interface RollResult {
  total: number;
  rolls: number[];
  kept: number[];
  modifier: number;
  // d100-only (sides === 100):
  is_double?: boolean;
  double_digit?: number;
}

export type RNG = (min: number, max: number) => number;

export const defaultRNG: RNG = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

export const fixedRNG =
  (value: number): RNG =>
  (min: number, max: number) =>
    Math.max(min, Math.min(max, value));
