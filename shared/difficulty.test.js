import { describe, expect, it } from "vitest";
import {
  DEFAULT_DIFFICULTY,
  DIFFICULTY_LEVELS,
  getDifficulty,
  isValidDifficulty,
} from "./difficulty.js";

describe("getDifficulty", () => {
  it("returns the config for a known difficulty id", () => {
    expect(getDifficulty("beginner")).toBe(DIFFICULTY_LEVELS.beginner);
    expect(getDifficulty("expert")).toBe(DIFFICULTY_LEVELS.expert);
  });

  it("falls back to the default for unknown ids", () => {
    expect(getDifficulty("impossible")).toBe(DIFFICULTY_LEVELS[DEFAULT_DIFFICULTY]);
    expect(getDifficulty(undefined)).toBe(DIFFICULTY_LEVELS[DEFAULT_DIFFICULTY]);
  });
});

describe("isValidDifficulty", () => {
  it("accepts known difficulty strings", () => {
    expect(isValidDifficulty("beginner")).toBe(true);
    expect(isValidDifficulty("intermediate")).toBe(true);
    expect(isValidDifficulty("expert")).toBe(true);
  });

  it("rejects non-strings and unknown ids", () => {
    expect(isValidDifficulty(null)).toBe(false);
    expect(isValidDifficulty(12)).toBe(false);
    expect(isValidDifficulty("legendary")).toBe(false);
  });
});