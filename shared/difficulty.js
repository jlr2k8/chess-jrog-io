export const DIFFICULTY_LEVELS = {
  easy: {
    id: "easy",
    label: "Easy",
    skillLevel: 5,
    movetimeMs: 600,
  },
  middle: {
    id: "middle",
    label: "Middle",
    skillLevel: 12,
    movetimeMs: 1500,
  },
  hard: {
    id: "hard",
    label: "Hard",
    skillLevel: 20,
    movetimeMs: 2500,
  },
};

export const DEFAULT_DIFFICULTY = "middle";

export const DIFFICULTY_IDS = Object.keys(DIFFICULTY_LEVELS);

export function getDifficulty(id) {
  return DIFFICULTY_LEVELS[id] ?? DIFFICULTY_LEVELS[DEFAULT_DIFFICULTY];
}

export function isValidDifficulty(id) {
  return typeof id === "string" && id in DIFFICULTY_LEVELS;
}
