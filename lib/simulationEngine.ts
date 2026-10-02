// lib/simulationEngine.ts
//
// Single source of truth for GodSim's simulation. Client-side, native React
// hooks only (useReducer + useEffect) — no external state library.
//
// Three systems layered on top of the original Cosmic Age / Tech Era / XP
// engine:
//   1. Endless Sky economic crises (Famine, Hyper-Inflation, Bountiful
//      Harvest, Gold Rush) that warp supply/basePrice for a run of ticks.
//   2. A WorldBox-style God Mode brush panel: bulk population edits,
//      treasury spawning, and per-citizen trait injection (Divine Blessing /
//      Bubonic Plague).
//   3. Ruler Mode legislation: Trade Tariffs, Conscription, and a Free
//      Market Charter, each a toggleable law with a treasury cost and a
//      permanent effect on the tick math while active.
//
// Scale note: `Nation.population` is an abstract economic bulk number (city
// population, thousands+) — separate from `people`, the small set of named,
// individually-simulated "notable citizens" whose job mix (Farmer/Scholar/
// Merchant ratios) is used as the workforce ratio applied against the whole
// population. That's what lets an individual citizen's job choice, XP, and
// injected traits meaningfully move a nation's whole economy without every
// one of thousands of citizens needing to be a simulated object.

import { useCallback, useEffect, useReducer, useState } from "react";

// ============================================================================
// 1. TIME & AGE SYSTEM MATRIX
// ============================================================================

export interface CosmicAge {
  name: string;
  colorTheme: "emerald" | "slate" | "rose" | "cyan";
  description: string;
  moodModifier: number;
  cropEfficiency: number;
  warChanceModifier: number;
}

export const COSMIC_AGES: readonly CosmicAge[] = [
  {
    name: "Age of Hope",
    colorTheme: "emerald",
    description: "Harvests are kind and hearts are light. The world believes in tomorrow.",
    moodModifier: 10,
    cropEfficiency: 1.2,
    warChanceModifier: 0.5,
  },
  {
    name: "Age of Tears",
    colorTheme: "slate",
    description: "A quiet grief hangs over the land. Fields yield less than they used to.",
    moodModifier: -10,
    cropEfficiency: 0.9,
    warChanceModifier: 1.0,
  },
  {
    name: "Age of Chaos",
    colorTheme: "rose",
    description: "Old alliances fray. Drums of war sound in every capital.",
    moodModifier: -20,
    cropEfficiency: 0.7,
    warChanceModifier: 2.0,
  },
  {
    name: "Age of Ice",
    colorTheme: "cyan",
    description: "A killing frost grips the world. Survival, not ambition, is the order of the day.",
    moodModifier: -15,
    cropEfficiency: 0.5,
    warChanceModifier: 0.8,
  },
] as const;

export const COSMIC_AGE_ROTATION_DAYS = 30;

export function getCosmicAgeIndex(day: number): number {
  return Math.floor(day / COSMIC_AGE_ROTATION_DAYS) % COSMIC_AGES.length;
}

export function getCosmicAge(day: number): CosmicAge {
  return COSMIC_AGES[getCosmicAgeIndex(day)];
}

export const COSMIC_AGE_THEME: Record<CosmicAge["colorTheme"], string> = {
  emerald: "from-emerald-950 via-slate-950 to-slate-950",
  slate: "from-slate-800 via-slate-950 to-slate-950",
  rose: "from-rose-950 via-slate-950 to-slate-950",
  cyan: "from-cyan-950 via-slate-950 to-slate-950",
};

export interface TechEraDefinition {
  name: string;
  minPopulation: number;
  minAverageTech: number;
}

export const TECH_ERAS: readonly TechEraDefinition[] = [
  { name: "Stone Age", minPopulation: 0, minAverageTech: 0 },
  { name: "Bronze Age", minPopulation: 8_000, minAverageTech: 15 },
  { name: "Iron Age", minPopulation: 20_000, minAverageTech: 35 },
  { name: "Classical Age", minPopulation: 40_000, minAverageTech: 60 },
  { name: "Medieval Age", minPopulation: 70_000, minAverageTech: 90 },
  { name: "Renaissance", minPopulation: 110_000, minAverageTech: 130 },
  { name: "Industrial Age", minPopulation: 160_000, minAverageTech: 180 },
  { name: "Modern Age", minPopulation: 220_000, minAverageTech: 240 },
  { name: "Information Age", minPopulation: 300_000, minAverageTech: 320 },
  { name: "Stellar Age", minPopulation: 400_000, minAverageTech: 420 },
] as const;

// ============================================================================
// 1b. THE WORLD MAP (WorldBox-style tile grid)
// ============================================================================

export const MAP_WIDTH = 30;
export const MAP_HEIGHT = 18;

export type TerrainType = "Water" | "Plains" | "Hills" | "Forest" | "Mountain" | "Desert";

/** The order a God Mode terrain brush cycles through / is offered in. */
export const TERRAIN_CYCLE: readonly TerrainType[] = [
  "Plains",
  "Hills",
  "Forest",
  "Mountain",
  "Desert",
  "Water",
] as const;

export interface Tile {
  x: number;
  y: number;
  terrain: TerrainType;
}

function tileIndex(x: number, y: number, width: number): number {
  return y * width + x;
}

/** Relative frequency of each land biome when scattering region seeds —
 * bigger weight means that biome tends to claim more of the map. */
const BIOME_WEIGHT: Record<Exclude<TerrainType, "Water">, number> = {
  Plains: 0.34,
  Forest: 0.24,
  Hills: 0.16,
  Desert: 0.15,
  Mountain: 0.11,
};

/** Terrain generator: a two-pass cellular-automata water mask (so coastlines
 * and lakes cluster into believable shapes instead of speckling), then land
 * biomes are grown from scattered weighted seed points rather than rolled
 * per-tile — nearest-seed assignment (with a touch of jitter so the borders
 * aren't razor-straight Voronoi lines) produces large, natural-looking
 * contiguous regions instead of salt-and-pepper noise. Deliberately simple —
 * flavor terrain for the map view and a God Mode brush canvas, not a real
 * hydrology/climate simulation. */
function generateMap(width: number, height: number): Tile[] {
  let water = new Array(width * height).fill(false).map(() => Math.random() < 0.32);

  // Two smoothing passes: coastlines/lakes cluster instead of speckling.
  for (let pass = 0; pass < 2; pass++) {
    water = water.map((_, i) => {
      const x = i % width;
      const y = Math.floor(i / width);
      let waterNeighbors = 0;
      let total = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          total++;
          if (water[tileIndex(nx, ny, width)]) waterNeighbors++;
        }
      }
      return waterNeighbors / total > 0.45;
    });
  }

  const landCoords: Array<[number, number]> = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!water[tileIndex(x, y, width)]) landCoords.push([x, y]);
    }
  }

  // Scatter a handful of biome "region seeds" across the land, weighted so
  // bigger-weight biomes get more seeds (and therefore more territory).
  const biomeTypes = Object.keys(BIOME_WEIGHT) as Array<Exclude<TerrainType, "Water">>;
  const totalSeeds = Math.max(biomeTypes.length, Math.round((width * height) / 42));
  const seeds: Array<{ x: number; y: number; biome: TerrainType }> = [];
  for (const biome of biomeTypes) {
    const count = Math.max(1, Math.round(totalSeeds * BIOME_WEIGHT[biome]));
    for (let i = 0; i < count; i++) {
      const [x, y] = landCoords.length ? choice(landCoords) : [0, 0];
      seeds.push({ x, y, biome });
    }
  }

  const tiles: Tile[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (water[tileIndex(x, y, width)]) {
        tiles.push({ x, y, terrain: "Water" });
        continue;
      }
      let best = seeds[0]?.biome ?? "Plains";
      let bestDist = Infinity;
      for (const seed of seeds) {
        // Jitter keeps region borders organic instead of crisp Voronoi lines.
        const dist = Math.hypot(x - seed.x, y - seed.y) + (Math.random() - 0.5) * 1.6;
        if (dist < bestDist) {
          bestDist = dist;
          best = seed.biome;
        }
      }
      tiles.push({ x, y, terrain: best });
    }
  }
  return tiles;
}

/** Picks a land tile as far as possible from any already-placed capital, so
 * founding nations don't spawn on top of one another. */
function pickCapitalTile(tiles: Tile[], existing: readonly [number, number][]): [number, number] {
  const land = tiles.filter((t) => t.terrain !== "Water");
  const candidates = land.length ? land : tiles;
  let best: Tile = candidates[0];
  let bestScore = -Infinity;
  for (let attempt = 0; attempt < 40; attempt++) {
    const t = choice(candidates);
    const minDist = existing.length
      ? Math.min(...existing.map(([ex, ey]) => Math.hypot(t.x - ex, t.y - ey)))
      : Infinity;
    if (minDist > bestScore) {
      bestScore = minDist;
      best = t;
    }
  }
  return [best.x, best.y];
}

/** How far (in tiles) a nation's territory reaches from its capital —
 * grows with population, capped so it never swallows the whole map. */
export function claimRadius(population: number): number {
  return 2 + Math.min(6, Math.floor(population / 15_000));
}

/** Pure, on-demand territory lookup: which nation (if any) owns each land
 * tile, by nearest capital within that nation's claim radius. Not stored on
 * WorldState — it's derived from `nations` + `map` fresh whenever needed. */
export function computeTerritory(state: WorldState): Map<string, number> {
  const ownership = new Map<string, number>();
  for (const tile of state.map) {
    if (tile.terrain === "Water") continue;
    let bestNationId: number | null = null;
    let bestDist = Infinity;
    for (const nation of state.nations) {
      const [cx, cy] = nation.capital;
      const dist = Math.hypot(tile.x - cx, tile.y - cy);
      if (dist <= claimRadius(nation.population) && dist < bestDist) {
        bestDist = dist;
        bestNationId = nation.id;
      }
    }
    if (bestNationId !== null) ownership.set(`${tile.x},${tile.y}`, bestNationId);
  }
  return ownership;
}

/** God Mode terrain brush — repaints a single tile. */
export function paintTerrain(state: WorldState, x: number, y: number, terrain: TerrainType): WorldState {
  let changed = false;
  const map = state.map.map((t) => {
    if (t.x === x && t.y === y && t.terrain !== terrain) {
      changed = true;
      return { ...t, terrain };
    }
    return t;
  });
  if (!changed) return state;
  return {
    ...state,
    map,
    eventLog: pushEvent(state.eventLog, state.day, "system", `The gods reshape the land at (${x}, ${y}) into ${terrain}.`),
  };
}

// ============================================================================
// 2. DATA SURFACE OBJECTS
// ============================================================================

export type JobClass = "Farmer" | "Scholar" | "Merchant";

export const TRAIT_POOL: readonly string[] = [
  "curious",
  "ambitious",
  "greedy",
  "pious",
  "brave",
  "kind",
  "lazy",
  "stoic",
] as const;

/** God-injected special traits — deliberately not part of TRAIT_POOL, so the
 * natural level-up trait roll can never hand these out on its own. */
export const DIVINE_BLESSING_TRAIT = "Divine Blessing";
export const BUBONIC_PLAGUE_TRAIT = "Bubonic Plague";

export interface Person {
  id: number;
  name: string;
  age: number;
  alive: boolean;
  hunger: number; // 0-100, 0 = starving
  energy: number; // 0-100
  mood: number; // 0-100, derived
  level: number;
  xp: number;
  job: JobClass;
  wealth: number;
  traits: string[];
  nationId: number;
}

export type GoodName = "Food" | "Luxury";

export interface MarketGood {
  name: GoodName;
  basePrice: number;
  price: number;
  delta: number;
  supply: number;
  demand: number;
}

export type CrisisType = "Famine" | "HyperInflation" | "BountifulHarvest" | "GoldRush";

export interface MarketCrisis {
  type: CrisisType;
  ticksRemaining: number;
}

export const CRISIS_LABEL: Record<CrisisType, string> = {
  Famine: "Famine",
  HyperInflation: "Hyper-Inflation",
  BountifulHarvest: "Bountiful Harvest",
  GoldRush: "Gold Rush",
};

export const CRISIS_DESCRIPTION: Record<CrisisType, string> = {
  Famine: "Food supply has collapsed — prices are spiking.",
  HyperInflation: "Currency is losing value fast — every good costs more.",
  BountifulHarvest: "An overflowing harvest is flooding the food market.",
  GoldRush: "A vein of wealth has sent luxury demand — and treasury — soaring.",
};

export type LawId = "tradeTariffs" | "conscription" | "freeMarketCharter";

export interface Law {
  id: LawId;
  name: string;
  description: string;
  cost: number;
  active: boolean;
}

export interface Nation {
  id: number;
  name: string;
  color: string;
  treasury: number;
  technology: number;
  /** Abstract economic population (thousands+) — see file header. */
  population: number;
  /** Rises only while Conscription is active; a standing-army proxy. */
  militaryMight: number;
  atWarWith: number[];
  market: MarketGood[];
  laws: Law[];
  activeCrisis: MarketCrisis | null;
  /** Tile coordinates of this nation's capital on `WorldState.map`. */
  capital: [number, number];
}

export interface EventLog {
  day: number;
  kind: "death" | "levelup" | "war" | "miracle" | "birth" | "system" | "crisis" | "law";
  text: string;
}

export interface WorldState {
  day: number;
  techEraIndex: number;
  people: Person[];
  nations: Nation[];
  eventLog: EventLog[];
  nextPersonId: number;
  /** The WorldBox-style terrain grid; static apart from God Mode's brush. */
  map: Tile[];
}

// ============================================================================
// tuning constants
// ============================================================================

const HUNGER_DECAY = 3;
const ENERGY_DECAY = 2;
const XP_PER_TICK: Record<JobClass, number> = { Farmer: 8, Scholar: 12, Merchant: 10 };
const TRAIT_UNLOCK_CHANCE_ON_LEVEL_UP = 0.25;
const DIVINE_BLESSING_XP_MULTIPLIER = 2;
const BUBONIC_PLAGUE_NEEDS_DECAY = 0.15; // slashes remaining hunger/energy by 15% every tick it's active

const FOOD_BASE_PRICE = 4;
const LUXURY_BASE_PRICE = 12;
const FOOD_OUTPUT_PER_CAPITA = 0.02;
const FOOD_DEMAND_PER_CAPITA = 0.012;
const FOOD_SUPPLY_JITTER = 2;
const LUXURY_OUTPUT_PER_CAPITA = 0.01;
const LUXURY_DEMAND_PER_CAPITA = 0.004;
const LUXURY_SUPPLY_JITTER = 1;

const TECH_PER_CAPITA = 0.0006;
const WEALTH_PER_CAPITA = 0.006;
const BASE_TAX_RATE = 0.1;
const TREASURY_TAX_YIELD = 0.05;

const BASE_GROWTH_RATE = 0.0015;
const WAR_BASE_CHANCE = 0.01;
const MAX_EVENT_LOG = 300;

// --- Ruler Mode legislation --------------------------------------------------
const TARIFF_FLAT_BONUS = 8;
const TARIFF_LUXURY_PRICE_BONUS = 0.5; // +50% base price on Luxury
const CONSCRIPTION_GROWTH_MULTIPLIER = 0.5;
const MILITARY_MIGHT_GAIN_PER_TICK = 4;
const FREE_MARKET_SCARCITY_MULTIPLIER = 2;
const FREE_MARKET_TAX_BONUS = 0.25;

export const LAW_COSTS: Record<LawId, number> = {
  tradeTariffs: 150,
  conscription: 200,
  freeMarketCharter: 250,
};

// --- Economic crises ---------------------------------------------------------
const CRISIS_TRIGGER_CHANCE = 0.012; // per nation, per tick, only while no crisis is active
const CRISIS_DURATION_TICKS = 15;
const CRISIS_TYPES: readonly CrisisType[] = ["Famine", "HyperInflation", "BountifulHarvest", "GoldRush"];
const FAMINE_SUPPLY_MULTIPLIER = 0.2; // -80%
const BOUNTIFUL_HARVEST_SUPPLY_MULTIPLIER = 2;
const HYPER_INFLATION_PRICE_MULTIPLIER = 2;
const GOLD_RUSH_DEMAND_MULTIPLIER = 1.5;
const GOLD_RUSH_TREASURY_BONUS = 40;

const NATION_NAMES = ["Aurelia", "Kaldor", "Vessin"];
const NATION_COLORS = ["#f59e0b", "#38bdf8", "#a78bfa"];
const FIRST_NAMES = [
  "Astra", "Milo", "Cassian", "Rowan", "Lyra", "Nova", "Sera", "Isolde",
  "Kael", "Orin", "Mira", "Vesper", "Ivo", "Thea", "Felix", "Wren",
];

export function levelThreshold(level: number): number {
  return level * 100;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const choice = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

// ============================================================================
// world factory
// ============================================================================

function makeLaws(): Law[] {
  return [
    {
      id: "tradeTariffs",
      name: "Trade Tariffs",
      description: "Luxury goods cost 50% more to trade; a flat cut of every tariff funnels straight into the treasury.",
      cost: LAW_COSTS.tradeTariffs,
      active: false,
    },
    {
      id: "conscription",
      name: "Conscription",
      description: "Halves natural population growth, but raises a standing Military Might that grows every tick.",
      cost: LAW_COSTS.conscription,
      active: false,
    },
    {
      id: "freeMarketCharter",
      name: "Free Market Charter",
      description: "Scarcity swings hit twice as hard in both directions; baseline tax revenue rises 25%.",
      cost: LAW_COSTS.freeMarketCharter,
      active: false,
    },
  ];
}

function makeNation(id: number, name: string, color: string, capital: [number, number]): Nation {
  return {
    id,
    name,
    color,
    treasury: 500,
    technology: 5,
    population: 5_000,
    militaryMight: 0,
    atWarWith: [],
    market: [
      { name: "Food", basePrice: FOOD_BASE_PRICE, price: FOOD_BASE_PRICE, delta: 0, supply: 100, demand: 100 },
      { name: "Luxury", basePrice: LUXURY_BASE_PRICE, price: LUXURY_BASE_PRICE, delta: 0, supply: 50, demand: 50 },
    ],
    laws: makeLaws(),
    activeCrisis: null,
    capital,
  };
}

function makePerson(id: number, nationId: number): Person {
  const job = choice<JobClass>(["Farmer", "Scholar", "Merchant"]);
  return {
    id,
    name: choice(FIRST_NAMES),
    age: randInt(18, 50),
    alive: true,
    hunger: randInt(60, 100),
    energy: randInt(60, 100),
    mood: 70,
    level: 1,
    xp: 0,
    job,
    wealth: randInt(0, 20),
    traits: [],
    nationId,
  };
}

export function createInitialWorld(): WorldState {
  const map = generateMap(MAP_WIDTH, MAP_HEIGHT);

  const capitals: [number, number][] = [];
  const nations = NATION_NAMES.map((name, i) => {
    const capital = pickCapitalTile(map, capitals);
    capitals.push(capital);
    return makeNation(i + 1, name, NATION_COLORS[i], capital);
  });

  let nextPersonId = 1;
  const people: Person[] = [];
  for (const nation of nations) {
    for (let i = 0; i < 6; i++) {
      people.push(makePerson(nextPersonId, nation.id));
      nextPersonId += 1;
    }
  }
  return {
    day: 0,
    techEraIndex: 0,
    people,
    nations,
    eventLog: [{ day: 0, kind: "system", text: "The world stirs awake." }],
    nextPersonId,
    map,
  };
}

// ============================================================================
// 3. THE MASTER TICK SIMULATION MATH
// ============================================================================

function pushEvent(log: EventLog[], day: number, kind: EventLog["kind"], text: string): EventLog[] {
  const next = [...log, { day, kind, text }];
  return next.length > MAX_EVENT_LOG ? next.slice(next.length - MAX_EVENT_LOG) : next;
}

function findLaw(nation: Nation, id: LawId): boolean {
  return nation.laws.find((l) => l.id === id)?.active ?? false;
}

function computeMood(hunger: number, energy: number, cosmicMoodModifier: number): number {
  const base = hunger * 0.55 + energy * 0.45;
  return clamp(Math.round(base + cosmicMoodModifier), 0, 100);
}

/** One full tick — called once per second by useSimulationEngine. Pure:
 * takes a WorldState, returns a brand-new one. */
export function processSimulationTick(state: WorldState): WorldState {
  const day = state.day + 1;
  const cosmicAge = getCosmicAge(day);
  let eventLog = state.eventLog;

  // --- needs decay, XP/leveling, deaths, trait effects ---------------------
  const people = state.people.map((person) => {
    if (!person.alive) return person;

    const plagued = person.traits.includes(BUBONIC_PLAGUE_TRAIT);
    let hunger = clamp(person.hunger - HUNGER_DECAY, 0, 100);
    let energy = clamp(person.energy - ENERGY_DECAY, 0, 100);
    if (plagued) {
      hunger = clamp(hunger * (1 - BUBONIC_PLAGUE_NEEDS_DECAY), 0, 100);
      energy = clamp(energy * (1 - BUBONIC_PLAGUE_NEEDS_DECAY), 0, 100);
    }

    if (hunger <= 0) {
      eventLog = pushEvent(eventLog, day, "death", `${person.name} has died of starvation.`);
      return { ...person, hunger: 0, energy, alive: false, mood: 0 };
    }

    const mood = computeMood(hunger, energy, cosmicAge.moodModifier);

    // Self-Improvement XP Engine: working citizens earn XP every tick.
    // Divine Blessing doubles the rate at which a blessed citizen levels up.
    let { level, xp, traits } = person;
    const blessed = traits.includes(DIVINE_BLESSING_TRAIT);
    xp += XP_PER_TICK[person.job] * (blessed ? DIVINE_BLESSING_XP_MULTIPLIER : 1);
    const threshold = levelThreshold(level);
    if (xp >= threshold) {
      xp -= threshold;
      level += 1;
      eventLog = pushEvent(eventLog, day, "levelup", `${person.name} reached level ${level}.`);
      if (Math.random() < TRAIT_UNLOCK_CHANCE_ON_LEVEL_UP) {
        const unclaimed = TRAIT_POOL.filter((t) => !traits.includes(t));
        if (unclaimed.length) {
          const newTrait = choice(unclaimed);
          traits = [...traits, newTrait];
          eventLog = pushEvent(eventLog, day, "levelup", `${person.name} discovered the "${newTrait}" trait.`);
        }
      }
    }

    return { ...person, hunger, energy, mood, level, xp, traits };
  });

  // --- per-nation economy: workforce, legislation, crises, market ----------
  const nations = state.nations.map((nation) => {
    const citizens = people.filter((p) => p.nationId === nation.id && p.alive);
    const total = citizens.length;
    const farmerFrac = total ? citizens.filter((p) => p.job === "Farmer").length / total : 1 / 3;
    const scholarFrac = total ? citizens.filter((p) => p.job === "Scholar").length / total : 1 / 3;
    const merchantFrac = total ? citizens.filter((p) => p.job === "Merchant").length / total : 1 / 3;

    const tradeTariffsActive = findLaw(nation, "tradeTariffs");
    const conscriptionActive = findLaw(nation, "conscription");
    const freeMarketActive = findLaw(nation, "freeMarketCharter");

    // population growth (Conscription halves it)
    const growthRate = BASE_GROWTH_RATE * (conscriptionActive ? CONSCRIPTION_GROWTH_MULTIPLIER : 1);
    const population = Math.max(0, Math.round(nation.population * (1 + growthRate)));

    // Military Might rises only while Conscription is active.
    const militaryMight = nation.militaryMight + (conscriptionActive ? MILITARY_MIGHT_GAIN_PER_TICK : 0);

    // workforce output
    const technology = nation.technology + population * scholarFrac * TECH_PER_CAPITA;
    let treasury = nation.treasury + population * merchantFrac * WEALTH_PER_CAPITA;

    // tax revenue (Free Market Charter: +25% baseline yield)
    let taxRevenue = population * BASE_TAX_RATE * TREASURY_TAX_YIELD;
    if (freeMarketActive) taxRevenue *= 1 + FREE_MARKET_TAX_BONUS;
    treasury += taxRevenue;
    if (tradeTariffsActive) treasury += TARIFF_FLAT_BONUS;

    // --- economic crisis: tick down an active one, or roll for a new one ---
    let activeCrisis = nation.activeCrisis;
    if (activeCrisis) {
      const ticksRemaining = activeCrisis.ticksRemaining - 1;
      if (ticksRemaining <= 0) {
        eventLog = pushEvent(eventLog, day, "crisis", `${CRISIS_LABEL[activeCrisis.type]} has passed in ${nation.name}.`);
        activeCrisis = null;
      } else {
        activeCrisis = { ...activeCrisis, ticksRemaining };
      }
    } else if (Math.random() < CRISIS_TRIGGER_CHANCE) {
      const type = choice(CRISIS_TYPES);
      activeCrisis = { type, ticksRemaining: CRISIS_DURATION_TICKS };
      eventLog = pushEvent(eventLog, day, "crisis", `${CRISIS_LABEL[type]} strikes ${nation.name}! ${CRISIS_DESCRIPTION[type]}`);
    }
    if (activeCrisis?.type === "GoldRush") treasury += GOLD_RUSH_TREASURY_BONUS;

    // Free Market Charter doubles how hard scarcity swings hit price.
    const scarcityMultiplier = freeMarketActive ? FREE_MARKET_SCARCITY_MULTIPLIER : 1;
    // Hyper-Inflation doubles every good's effective base price for its duration.
    const priceMultiplier = activeCrisis?.type === "HyperInflation" ? HYPER_INFLATION_PRICE_MULTIPLIER : 1;

    const market = nation.market.map((good) => {
      let supply: number;
      let demand: number;

      if (good.name === "Food") {
        const jitter = (Math.random() * 2 - 1) * FOOD_SUPPLY_JITTER;
        supply = Math.max(0, population * farmerFrac * FOOD_OUTPUT_PER_CAPITA * cosmicAge.cropEfficiency + jitter);
        if (activeCrisis?.type === "Famine") supply *= FAMINE_SUPPLY_MULTIPLIER;
        if (activeCrisis?.type === "BountifulHarvest") supply *= BOUNTIFUL_HARVEST_SUPPLY_MULTIPLIER;
        demand = Math.max(0, Math.round(population * FOOD_DEMAND_PER_CAPITA));
      } else {
        const jitter = (Math.random() * 2 - 1) * LUXURY_SUPPLY_JITTER;
        supply = Math.max(0, population * merchantFrac * LUXURY_OUTPUT_PER_CAPITA + jitter);
        demand = Math.max(0, Math.round(population * LUXURY_DEMAND_PER_CAPITA));
        if (activeCrisis?.type === "GoldRush") demand *= GOLD_RUSH_DEMAND_MULTIPLIER;
      }

      let effectiveBasePrice = good.basePrice * priceMultiplier;
      if (good.name === "Luxury" && tradeTariffsActive) effectiveBasePrice *= 1 + TARIFF_LUXURY_PRICE_BONUS;

      const ratio = (demand / Math.max(1, supply)) * scarcityMultiplier;
      const rawPrice = effectiveBasePrice * ratio;
      const price = clamp(Math.round(rawPrice * 100) / 100, 1, 100);
      const delta = Math.round((price - good.price) * 100) / 100;

      return { ...good, supply, demand, price, delta };
    });

    return { ...nation, population, militaryMight, technology, treasury, market, activeCrisis };
  });

  const livingPopulation = nations.reduce((sum, n) => sum + n.population, 0);

  // --- Dynamic Aggression Events: cosmic-age-scaled random war declarations -
  let finalNations = nations;
  for (let i = 0; i < finalNations.length; i++) {
    for (let j = i + 1; j < finalNations.length; j++) {
      const a = finalNations[i];
      const b = finalNations[j];
      if (a.atWarWith.includes(b.id)) continue;
      if (Math.random() < WAR_BASE_CHANCE * cosmicAge.warChanceModifier) {
        finalNations = finalNations.map((n) => {
          if (n.id === a.id) return { ...n, atWarWith: [...n.atWarWith, b.id] };
          if (n.id === b.id) return { ...n, atWarWith: [...n.atWarWith, a.id] };
          return n;
        });
        eventLog = pushEvent(eventLog, day, "war", `${a.name} declared war on ${b.name}!`);
      }
    }
  }

  // --- Age transition (permanent, sequential) --------------------------------
  const averageTech =
    finalNations.length > 0
      ? finalNations.reduce((sum, n) => sum + n.technology, 0) / finalNations.length
      : 0;
  let techEraIndex = state.techEraIndex;
  TECH_ERAS.forEach((era, i) => {
    if (livingPopulation >= era.minPopulation && averageTech >= era.minAverageTech) {
      techEraIndex = i;
    }
  });
  if (techEraIndex > state.techEraIndex) {
    eventLog = pushEvent(eventLog, day, "system", `The world has advanced into the ${TECH_ERAS[techEraIndex].name}.`);
  }

  return {
    day,
    techEraIndex,
    people,
    nations: finalNations,
    map: state.map,
    eventLog,
    nextPersonId: state.nextPersonId,
  };
}

// ============================================================================
// 4. God Mode actions (pure, same shape as processSimulationTick)
// ============================================================================

export function spawnCitizen(state: WorldState): WorldState {
  const nation = choice(state.nations);
  const person = makePerson(state.nextPersonId, nation.id);
  return {
    ...state,
    people: [...state.people, person],
    nextPersonId: state.nextPersonId + 1,
    eventLog: pushEvent(state.eventLog, state.day, "birth", `${person.name} has arrived in ${nation.name}.`),
  };
}

/** Blesses one random living citizen — full needs restore, a mood/wealth
 * bump, and an event log entry. */
export function castBlessing(state: WorldState): WorldState {
  const living = state.people.filter((p) => p.alive);
  if (!living.length) return state;
  const target = choice(living);
  const people = state.people.map((p) =>
    p.id === target.id
      ? { ...p, hunger: 100, energy: 100, mood: clamp(p.mood + 25, 0, 100), wealth: p.wealth + 15 }
      : p
  );
  return {
    ...state,
    people,
    eventLog: pushEvent(state.eventLog, state.day, "miracle", `A blessing fell upon ${target.name}.`),
  };
}

/** Population Editor — "Set" button. Directly overwrites a nation's bulk
 * population figure. */
export function setPopulation(state: WorldState, nationId: number, population: number): WorldState {
  const clamped = Math.max(0, Math.round(population));
  return {
    ...state,
    nations: state.nations.map((n) => (n.id === nationId ? { ...n, population: clamped } : n)),
  };
}

/** Population Editor — "+10k Pop" / "-10k Pop" quick-tap buttons. */
export function adjustPopulation(state: WorldState, nationId: number, delta: number): WorldState {
  return {
    ...state,
    nations: state.nations.map((n) =>
      n.id === nationId ? { ...n, population: Math.max(0, Math.round(n.population + delta)) } : n
    ),
  };
}

/** Treasury Spawner — "Spawn 5,000 gp" button. */
export function addTreasury(state: WorldState, nationId: number, amount: number): WorldState {
  const nation = state.nations.find((n) => n.id === nationId);
  return {
    ...state,
    nations: state.nations.map((n) => (n.id === nationId ? { ...n, treasury: n.treasury + amount } : n)),
    eventLog: nation
      ? pushEvent(state.eventLog, state.day, "miracle", `${amount.toLocaleString()} gp materialized in ${nation.name}'s treasury.`)
      : state.eventLog,
  };
}

/** Trait Injection System — toggles a special trait (Divine Blessing /
 * Bubonic Plague, or any string) on a specific citizen's `traits` array. */
export function togglePersonTrait(state: WorldState, personId: number, trait: string): WorldState {
  const person = state.people.find((p) => p.id === personId);
  if (!person) return state;
  const has = person.traits.includes(trait);
  const people = state.people.map((p) =>
    p.id === personId
      ? { ...p, traits: has ? p.traits.filter((t) => t !== trait) : [...p.traits, trait] }
      : p
  );
  const text = has
    ? `${person.name} is no longer touched by ${trait}.`
    : `${trait} has been laid upon ${person.name}.`;
  return {
    ...state,
    people,
    eventLog: pushEvent(state.eventLog, state.day, "miracle", text),
  };
}

/** Ruler Mode legislation toggle. Activating a law deducts its treasury
 * cost up front; if the nation can't afford it, the state is returned
 * unchanged. Repealing a law is free but non-refundable. */
export function toggleLaw(state: WorldState, nationId: number, lawId: LawId): WorldState {
  const nation = state.nations.find((n) => n.id === nationId);
  if (!nation) return state;
  const law = nation.laws.find((l) => l.id === lawId);
  if (!law) return state;

  if (!law.active && nation.treasury < law.cost) {
    return state; // can't afford to pass it
  }

  const nextActive = !law.active;
  const nations = state.nations.map((n) => {
    if (n.id !== nationId) return n;
    return {
      ...n,
      treasury: nextActive ? n.treasury - law.cost : n.treasury,
      laws: n.laws.map((l) => (l.id === lawId ? { ...l, active: nextActive } : l)),
    };
  });

  const text = nextActive
    ? `${nation.name} passes ${law.name}.`
    : `${nation.name} repeals ${law.name}.`;

  return { ...state, nations, eventLog: pushEvent(state.eventLog, state.day, "law", text) };
}

// ============================================================================
// React hook
// ============================================================================

type EngineAction =
  | { type: "TICK" }
  | { type: "SPAWN_CITIZEN" }
  | { type: "CAST_BLESSING" }
  | { type: "SET_POPULATION"; nationId: number; population: number }
  | { type: "ADJUST_POPULATION"; nationId: number; delta: number }
  | { type: "ADD_TREASURY"; nationId: number; amount: number }
  | { type: "TOGGLE_PERSON_TRAIT"; personId: number; trait: string }
  | { type: "TOGGLE_LAW"; nationId: number; lawId: LawId }
  | { type: "PAINT_TERRAIN"; x: number; y: number; terrain: TerrainType };

function reducer(state: WorldState, action: EngineAction): WorldState {
  switch (action.type) {
    case "TICK":
      return processSimulationTick(state);
    case "SPAWN_CITIZEN":
      return spawnCitizen(state);
    case "CAST_BLESSING":
      return castBlessing(state);
    case "SET_POPULATION":
      return setPopulation(state, action.nationId, action.population);
    case "ADJUST_POPULATION":
      return adjustPopulation(state, action.nationId, action.delta);
    case "ADD_TREASURY":
      return addTreasury(state, action.nationId, action.amount);
    case "TOGGLE_PERSON_TRAIT":
      return togglePersonTrait(state, action.personId, action.trait);
    case "TOGGLE_LAW":
      return toggleLaw(state, action.nationId, action.lawId);
    case "PAINT_TERRAIN":
      return paintTerrain(state, action.x, action.y, action.terrain);
    default:
      return state;
  }
}

export interface UseSimulationEngineResult {
  world: WorldState;
  isRunning: boolean;
  setRunning: (running: boolean) => void;

  spawnCitizenAction: () => void;
  castBlessingAction: () => void;
  setPopulationAction: (nationId: number, population: number) => void;
  adjustPopulationAction: (nationId: number, delta: number) => void;
  addTreasuryAction: (nationId: number, amount: number) => void;
  togglePersonTraitAction: (personId: number, trait: string) => void;
  toggleLawAction: (nationId: number, lawId: LawId) => void;
  paintTerrainAction: (x: number, y: number, terrain: TerrainType) => void;
}

/**
 * Drives the engine with a plain setInterval — one tick per second while
 * `isRunning`. The interval's only effect dependency is `isRunning`;
 * `dispatch` from `useReducer` is referentially stable for the life of the
 * component, so the tick callback never closes over stale state and
 * ticking itself never re-triggers the effect.
 */
export function useSimulationEngine(): UseSimulationEngineResult {
  const [world, dispatch] = useReducer(reducer, undefined, createInitialWorld);
  const [isRunning, setIsRunning] = useState(true);

  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => dispatch({ type: "TICK" }), 1000);
    return () => clearInterval(id);
  }, [isRunning]);

  const spawnCitizenAction = useCallback(() => dispatch({ type: "SPAWN_CITIZEN" }), []);
  const castBlessingAction = useCallback(() => dispatch({ type: "CAST_BLESSING" }), []);
  const setPopulationAction = useCallback(
    (nationId: number, population: number) => dispatch({ type: "SET_POPULATION", nationId, population }),
    []
  );
  const adjustPopulationAction = useCallback(
    (nationId: number, delta: number) => dispatch({ type: "ADJUST_POPULATION", nationId, delta }),
    []
  );
  const addTreasuryAction = useCallback(
    (nationId: number, amount: number) => dispatch({ type: "ADD_TREASURY", nationId, amount }),
    []
  );
  const togglePersonTraitAction = useCallback(
    (personId: number, trait: string) => dispatch({ type: "TOGGLE_PERSON_TRAIT", personId, trait }),
    []
  );
  const toggleLawAction = useCallback(
    (nationId: number, lawId: LawId) => dispatch({ type: "TOGGLE_LAW", nationId, lawId }),
    []
  );
  const paintTerrainAction = useCallback(
    (x: number, y: number, terrain: TerrainType) => dispatch({ type: "PAINT_TERRAIN", x, y, terrain }),
    []
  );

  return {
    world,
    isRunning,
    setRunning: setIsRunning,
    spawnCitizenAction,
    castBlessingAction,
    setPopulationAction,
    adjustPopulationAction,
    addTreasuryAction,
    togglePersonTraitAction,
    toggleLawAction,
    paintTerrainAction,
  };
}
