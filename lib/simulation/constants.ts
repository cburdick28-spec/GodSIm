// lib/simulation/constants.ts
//
// Core content matrices — the direct TS equivalent of the Python script's
// module-level data tables (SEASONS, WEATHERS, AGES, RELIGIONS, JOBS,
// BUILDING_KINDS). Kept as plain readonly data so they're trivial to tune
// or extend without touching engine logic.

import type {
  AgeDefinition,
  BuildingKindDefinition,
  JobDefinition,
  ReligionDefinition,
  ResourceName,
  Season,
  Weather,
} from "./types";

export const SEASONS: readonly Season[] = [
  "Spring",
  "Summer",
  "Autumn",
  "Winter",
] as const;

/** In-game days per season before it rolls over to the next. */
export const SEASON_LENGTH_DAYS = 90;

export const WEATHERS: readonly Weather[] = [
  "Clear",
  "Rain",
  "Storm",
  "Snow",
  "Drought",
] as const;

/** Ages in ascending order — the engine walks this list to find the
 * highest one the world currently qualifies for. */
export const AGES: readonly AgeDefinition[] = [
  { name: "Stone Age", techRequired: 0, popRequired: 0 },
  { name: "Bronze Age", techRequired: 20, popRequired: 50 },
  { name: "Iron Age", techRequired: 45, popRequired: 150 },
  { name: "Classical Age", techRequired: 70, popRequired: 400 },
  { name: "Medieval Age", techRequired: 100, popRequired: 800 },
] as const;

export const RELIGIONS: readonly ReligionDefinition[] = [
  { name: "Sun Cult", devotionDecayPerDay: 0.5 },
  { name: "Ancestor Worship", devotionDecayPerDay: 0.3 },
  { name: "Old Gods", devotionDecayPerDay: 0.4 },
  { name: "The Unseen Path", devotionDecayPerDay: 0.6 },
] as const;

export const JOBS: Readonly<Record<string, JobDefinition>> = {
  Farmer: {
    name: "Farmer",
    resource: "Food",
    outputPerWorker: 1.2,
    wealthPerWorker: 0,
  },
  Miner: {
    name: "Miner",
    resource: "Iron",
    outputPerWorker: 0.9,
    wealthPerWorker: 0,
  },
  Artisan: {
    name: "Artisan",
    resource: "Luxury",
    outputPerWorker: 0.6,
    wealthPerWorker: 0.4,
  },
  Merchant: {
    name: "Merchant",
    outputPerWorker: 0,
    wealthPerWorker: 2.5,
  },
};

export const BUILDING_KINDS: Readonly<Record<string, BuildingKindDefinition>> = {
  Hut: { name: "Hut", cost: { Food: 10 }, capacity: 4 },
  Farm: { name: "Farm", cost: { Food: 5, Iron: 5 }, capacity: 6 },
  Mine: { name: "Mine", cost: { Iron: 20 }, capacity: 6 },
  Market: { name: "Market", cost: { Iron: 15, Luxury: 5 }, capacity: 3 },
  Temple: { name: "Temple", cost: { Luxury: 25 }, capacity: 2 },
};

export const MARKET_BASE_PRICES: Readonly<Record<ResourceName, number>> = {
  Food: 4,
  Iron: 9,
  Luxury: 25,
};

/** Roughly how much of each resource one person consumes per tick — drives
 * MarketGood.demand alongside the scarcity pricing formula. */
export const DEMAND_PER_CAPITA: Readonly<Record<ResourceName, number>> = {
  Food: 0.0009,
  Iron: 0.0004,
  Luxury: 0.0002,
};
