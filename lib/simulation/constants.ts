// lib/simulation/constants.ts
//
// Direct port of SimGod's module-level content tables.

import type {
  AgeDefinition,
  BuildingKindDefinition,
  JobDefinition,
  ReligionDefinition,
  Season,
  Weather,
} from "./types";

export const SEASONS: readonly Season[] = [
  "Spring",
  "Summer",
  "Autumn",
  "Winter",
] as const;

export const WEATHERS: readonly Weather[] = [
  "Clear",
  "Sunny",
  "Cloudy",
  "Rainy",
  "Windy",
  "Stormy",
  "Snowy",
  "Foggy",
] as const;

// (name, minPopulation, minTech, description)
export const AGES: readonly AgeDefinition[] = [
  { name: "Stone Age", minPopulation: 0, minTech: 0, description: "Fire, sticks, and stories under the stars." },
  { name: "Bronze Age", minPopulation: 10, minTech: 8, description: "Metal, writing, first cities." },
  { name: "Iron Age", minPopulation: 25, minTech: 16, description: "Empires, roads, philosophy." },
  { name: "Classical Age", minPopulation: 45, minTech: 26, description: "Theater, math, engineered wonders." },
  { name: "Medieval Age", minPopulation: 70, minTech: 38, description: "Castles, guilds, cathedrals, plagues." },
  { name: "Renaissance", minPopulation: 100, minTech: 52, description: "Art, science, exploration." },
  { name: "Industrial Age", minPopulation: 140, minTech: 70, description: "Steam, factories, smoke, railways." },
  { name: "Modern Age", minPopulation: 190, minTech: 90, description: "Electricity, media, global trade." },
  { name: "Information Age", minPopulation: 250, minTech: 110, description: "Networks, satellites, silicon minds." },
  { name: "Stellar Age", minPopulation: 320, minTech: 140, description: "Starships and the first off-world colonies." },
] as const;
// Note: the source table is (name, min_pop, min_tech, desc) — population and
// tech requirements are listed in that order there but *checked* as
// (pop >= min_pop and tech >= min_tech) in current_age(), same as here.

export const RELIGIONS: readonly ReligionDefinition[] = [
  { name: "Solarism", description: "The Sun is the One, giver of warmth and judgment." },
  { name: "Lunarism", description: "The Moon watches in silence; dreams are prayer." },
  { name: "The Verdant Way", description: "All life is holy; groves are temples." },
  { name: "Stormcult", description: "Thunder is the voice of the divine." },
  { name: "The Silent Order", description: "Gods exist, but do not speak. Silence is devotion." },
  { name: "Ancestral Flame", description: "The dead guide the living through fire." },
  { name: "The Unnamed", description: "To name the divine is to diminish it." },
] as const;

// (title, minAge, wage, moodBonus, produces)
export const JOBS: readonly JobDefinition[] = [
  { title: "Child", minAge: 0, wage: 0, moodBonus: 5, produces: null },
  { title: "Farmer", minAge: 14, wage: 4, moodBonus: 2, produces: "food" },
  { title: "Hunter", minAge: 14, wage: 5, moodBonus: 1, produces: "food" },
  { title: "Builder", minAge: 16, wage: 7, moodBonus: 0, produces: "buildings" },
  { title: "Merchant", minAge: 16, wage: 9, moodBonus: 2, produces: "wealth" },
  { title: "Soldier", minAge: 16, wage: 8, moodBonus: -1, produces: "security" },
  { title: "Scholar", minAge: 16, wage: 6, moodBonus: 3, produces: "tech" },
  { title: "Priest", minAge: 16, wage: 6, moodBonus: 4, produces: "faith" },
  { title: "Artist", minAge: 16, wage: 5, moodBonus: 5, produces: "culture" },
  { title: "Healer", minAge: 18, wage: 7, moodBonus: 3, produces: "health" },
  { title: "Athlete", minAge: 16, wage: 6, moodBonus: 4, produces: "sport" },
  { title: "Sailor", minAge: 18, wage: 7, moodBonus: 1, produces: "trade" },
  { title: "Engineer", minAge: 20, wage: 12, moodBonus: 2, produces: "tech" },
  { title: "Teacher", minAge: 20, wage: 8, moodBonus: 3, produces: "culture" },
  { title: "Scientist", minAge: 22, wage: 14, moodBonus: 2, produces: "tech" },
  { title: "Politician", minAge: 22, wage: 11, moodBonus: -2, produces: "influence" },
  { title: "Philosopher", minAge: 20, wage: 5, moodBonus: 4, produces: "culture" },
  { title: "Inventor", minAge: 22, wage: 13, moodBonus: 2, produces: "tech" },
] as const;

export const BUILDING_KINDS: Readonly<Record<string, BuildingKindDefinition>> = {
  House: { cost: 40, capacity: 4 },
  Farm: { cost: 30, capacity: 6 },
  Market: { cost: 55, capacity: 8 },
  Temple: { cost: 70, capacity: 10 },
  Barracks: { cost: 65, capacity: 8 },
  School: { cost: 60, capacity: 10 },
  Arena: { cost: 75, capacity: 12 },
  Tavern: { cost: 45, capacity: 10 },
  Hospital: { cost: 80, capacity: 10 },
  Theater: { cost: 65, capacity: 12 },
  Library: { cost: 60, capacity: 8 },
  Port: { cost: 90, capacity: 14 },
  Wall: { cost: 85, capacity: 0 },
  Monument: { cost: 120, capacity: 0 },
};

/** Relative pick-weights nation_tick() uses when a nation auto-constructs a
 * building — same order/weights as the source's random.choices() call. */
export const BUILDING_PICK_WEIGHTS: readonly number[] = [
  3, 3, 2, 2, 1, 2, 1, 2, 1, 1, 1, 1, 1, 0.5,
];

export const HOLIDAYS: readonly string[] = [
  "Festival of Light",
  "Harvest Home",
  "Day of Silence",
  "Founders' Day",
  "Night of Masks",
  "Feast of Stars",
  "Remembrance",
  "First Bloom",
  "Longest Night",
  "Storm's End",
] as const;

export const SPORTS: readonly string[] = [
  "Footrace",
  "Wrestling",
  "Archery",
  "Ball Game",
  "Chariot Race",
  "Swordplay",
  "Swimming",
  "Stone Throw",
] as const;

export const TRAITS: readonly string[] = [
  "kind",
  "brave",
  "curious",
  "lazy",
  "ambitious",
  "pious",
  "greedy",
  "loyal",
  "cruel",
  "artistic",
  "stoic",
  "dreamer",
] as const;

export const NAMES_M: readonly string[] = [
  "Astra", "Milo", "Cassian", "Rowan", "Dorian", "Silas", "Kael",
  "Orin", "Bran", "Taren", "Ivo", "Lucian", "Felix", "Cyrus",
] as const;

export const NAMES_F: readonly string[] = [
  "Lyra", "Nova", "Sera", "Isolde", "Mira", "Vesper", "Elara",
  "Nadia", "Junia", "Ophelia", "Wren", "Thea", "Iris", "Selene",
] as const;

export const NAMES_X: readonly string[] = [
  "Ash", "River", "Sky", "Ember", "Quill", "Sol", "Vale", "Echo",
] as const;

export const NATION_COLORS: readonly string[] = [
  "#4ecdc4", "#ff6b6b", "#ffd93d", "#a06cd5",
  "#6bcb77", "#ff9f1c", "#5bc0eb", "#e76f51",
] as const;

export function findJob(title: string): JobDefinition {
  return JOBS.find((j) => j.title === title) ?? JOBS[0];
}
