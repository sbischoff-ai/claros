import { describe, it, expect } from "vitest"
import { rollDice } from "../src/dice/evaluator"
import type { RNG } from "../src/dice/types"

function seqRNG(values: number[]): RNG {
  let i = 0
  return () => values[i++]
}
function fixedRNG(value: number): RNG {
  return () => value
}

describe("rollDice", () => {
  describe("standard rolls", () => {
    it("rolls a single die", () =>
      expect(rollDice("1d20", fixedRNG(14))).toEqual({ total: 14, rolls: [14], kept: [14], modifier: 0 }))

    it("rolls multiple dice and sums", () =>
      expect(rollDice("2d6+3", seqRNG([3, 4]))).toEqual({ total: 10, rolls: [3, 4], kept: [3, 4], modifier: 3 }))

    it("applies negative modifier", () =>
      expect(rollDice("1d20-2", fixedRNG(10))).toEqual({ total: 8, rolls: [10], kept: [10], modifier: -2 }))
  })

  describe("keep highest/lowest", () => {
    it("keeps highest 1 of 2d20 (advantage)", () => {
      const r = rollDice("2d20kh1", seqRNG([14, 7]))
      expect(r.total).toBe(14)
      expect(r.rolls).toEqual([14, 7])
      expect(r.kept).toEqual([14])
    })

    it("keeps lowest 1 of 2d20 (disadvantage)", () => {
      const r = rollDice("2d20kl1", seqRNG([14, 7]))
      expect(r.total).toBe(7)
      expect(r.rolls).toEqual([14, 7])
      expect(r.kept).toEqual([7])
    })

    it("keeps highest 3 of 4d6 (stat roll)", () => {
      const r = rollDice("4d6kh3", seqRNG([3, 5, 4, 6]))
      expect(r.total).toBe(15)
      expect(r.kept).toEqual(expect.arrayContaining([6, 5, 4]))
      expect(r.kept).toHaveLength(3)
    })
  })

  describe("pool threshold", () => {
    it("counts dice meeting threshold", () => {
      const r = rollDice("5d6>=4", seqRNG([3, 4, 5, 6, 2]))
      expect(r.total).toBe(3)
      expect(r.rolls).toEqual([3, 4, 5, 6, 2])
      expect(r.kept).toEqual(expect.arrayContaining([4, 5, 6]))
      expect(r.kept).toHaveLength(3)
    })

    it("returns 0 successes when no dice meet threshold", () => {
      const r = rollDice("3d6>=6", seqRNG([1, 2, 3]))
      expect(r.total).toBe(0)
      expect(r.kept).toHaveLength(0)
    })
  })

  describe("exploding dice", () => {
    it("re-rolls on max face and accumulates", () => {
      const r = rollDice("1d6!", seqRNG([6, 3]))
      expect(r.total).toBe(9)
      expect(r.rolls).toEqual([6, 3])
    })

    it("does not re-roll on non-max face", () => {
      const r = rollDice("1d6!", seqRNG([4]))
      expect(r.total).toBe(4)
      expect(r.rolls).toEqual([4])
    })

    it("chains multiple explosions", () => {
      const r = rollDice("1d6!", seqRNG([6, 6, 3]))
      expect(r.total).toBe(15)
      expect(r.rolls).toEqual([6, 6, 3])
    })

    it("rolls each die in a multi-die exploding pool independently", () => {
      // 2d6!: first die rolls 6 then 3 (explodes once), second die rolls 4 (no explode)
      const r = rollDice("2d6!", seqRNG([6, 3, 4]))
      expect(r.rolls).toEqual([6, 3, 4])
      expect(r.kept).toEqual([6, 3, 4])
      expect(r.total).toBe(13)
    })

    it("2d6! with no explosions sums both dice normally", () => {
      const r = rollDice("2d6!", seqRNG([2, 5]))
      expect(r.rolls).toEqual([2, 5])
      expect(r.total).toBe(7)
    })

    it("3d6! each die explodes independently", () => {
      // die 1: 6,6,2 (double explode); die 2: 4; die 3: 6,1 (one explode)
      const r = rollDice("3d6!", seqRNG([6, 6, 2, 4, 6, 1]))
      expect(r.rolls).toEqual([6, 6, 2, 4, 6, 1])
      expect(r.total).toBe(6 + 6 + 2 + 4 + 6 + 1)
    })

    it("4d6! with no explosions sums all four dice", () => {
      const r = rollDice("4d6!", seqRNG([1, 2, 3, 4]))
      expect(r.rolls).toEqual([1, 2, 3, 4])
      expect(r.total).toBe(10)
    })
  })

  describe("d100 derived properties", () => {
    const doubles = [11, 22, 33, 44, 55, 66, 77, 88, 99]
    const nonDoubles = [10, 12, 21, 23, 43, 45, 50, 98]

    it.each(doubles)("detects %i as a double", (value) => {
      const r = rollDice("1d100", fixedRNG(value))
      expect(r.is_double).toBe(true)
      expect(r.double_digit).toBe(value / 11)
    })

    it.each(nonDoubles)("rejects %i as not a double", (value) => {
      const r = rollDice("1d100", fixedRNG(value))
      expect(r.is_double).toBe(false)
    })

    it("treats 100 as double-10", () => {
      const r = rollDice("1d100", fixedRNG(100))
      expect(r.is_double).toBe(true)
      expect(r.double_digit).toBe(10)
    })

    it("double_digit for 100 is 10, not 9 (floor division edge case)", () => {
      const r = rollDice("1d100", fixedRNG(100))
      expect(r.double_digit).toBe(10)
      expect(r.double_digit).not.toBe(9)
    })

    it("always includes is_double and double_digit for d100 results", () => {
      const r = rollDice("1d100", fixedRNG(43))
      expect(r).toHaveProperty("is_double")
      expect(r).toHaveProperty("double_digit")
    })

    it("does not add d100 properties to non-d100 rolls", () => {
      const r = rollDice("1d20", fixedRNG(11))
      expect(r).not.toHaveProperty("is_double")
      expect(r).not.toHaveProperty("double_digit")
    })
  })

  describe("string shorthand", () => {
    it("accepts a string expression directly", () =>
      expect(rollDice("2d6+3", seqRNG([3, 4])).total).toBe(10))
  })
})
