export const DIFFICULTY_LEVELS = {
  beginner: {
    id: "beginner",
    label: "Beginner",
    skillLevel: 2,
    movetimeMs: 400,
  },
  casual: {
    id: "casual",
    label: "Casual",
    skillLevel: 6,
    movetimeMs: 700,
  },
  intermediate: {
    id: "intermediate",
    label: "Intermediate",
    skillLevel: 10,
    movetimeMs: 1200,
  },
  advanced: {
    id: "advanced",
    label: "Advanced",
    skillLevel: 14,
    movetimeMs: 1800,
  },
  expert: {
    id: "expert",
    label: "Expert",
    skillLevel: 20,
    movetimeMs: 2500,
  },
};

export const DEFAULT_DIFFICULTY = "casual";

export const DIFFICULTY_IDS = Object.keys(DIFFICULTY_LEVELS);

export function getDifficulty(id) {
  return DIFFICULTY_LEVELS[id] ?? DIFFICULTY_LEVELS[DEFAULT_DIFFICULTY];
}

export function isValidDifficulty(id) {
  return typeof id === "string" && id in DIFFICULTY_LEVELS;
}