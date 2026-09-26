// lib/simulationEngine.ts
//
// Client-side civilization engine for GodSim — data layer + math only.
// No external state library: `useSimulationEngine` below is a plain
// React hook (useReducer + useEffect), so `app/page.tsx` can consume it
// with nothing but native hooks.
//
// Note on scope vs. the literal spec: Person and Nation carry a couple of
// fields beyond the ones explicitly listed (Person.nationId, a market
// registry keyed to it) because the spec's own mechanics need them — a
// "national technology score" and a "localized commodity market" only
// make sense if citizens are linked to a nation. Flagged here rather than
// silently expanded.

import { useCallback, useEffect, useReducer, useState } from "react";

// ============================================================================
// 1. TIME & AGE SYSTEM MATRIX
// ============================================================================

export interface CosmicAge {
  name: string;
  /** Tailwind color keyword used to theme the dashboard shell while this
   * age is active (see COSMIC_AGE_THEME below for the actual classes). */
  colorTheme: "emerald" | "slate" | "rose" | "cyan";
  description: string;
  /** Additive shift applied to every living citizen's computed mood. */
  moodModifier: number;
  /** Multiplier on Farmer output feeding the Food supply pool. */
  cropEfficiency: number;
  /** Multiplier on the per-tick chance of a random war declaration. */
  warChanceModifier: number;
}

/** Rotates automatically every 30 game days — purely a function of `day`,
 * never stored, so it can't drift out of sync with time itself. */
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

/** Tailwind classes per `colorTheme`, applied to the dashboard's ambient
 * background shell with a transition so shifts between ages animate. */
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

/** Long-term, sequential, and permanent — the world only ever advances
 * forward through this list, gated on population + average national tech. */
export const TECH_ERAS: readonly TechEraDefinition[] = [
  { name: "Stone Age", minPopulation: 0, minAverageTech: 0 },
  { name: "Bronze Age", minPopulation: 15, minAverageTech: 15 },
  { name: "Iron Age", minPopulation: 30, minAverageTech: 35 },
  { name: "Classical Age", minPopulation: 50, minAverageTech: 60 },
  { name: "Medieval Age", minPopulation: 75, minAverageTech: 90 },
  { name: "Renaissance", minPopulation: 100, minAverageTech: 130 },
  { name: "Industrial Age", minPopulation: 130, minAverageTech: 180 },
  { name: "Modern Age", minPopulation: 160, minAverageTech: 240 },
  { name: "Information Age", minPopulation: 200, minAverageTech: 320 },
  { name: "Stellar Age", minPopulation: 250, minAverageTech: 420 },
] as const;

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
  /** Not in the original field list — added because national tech/market
   * mechanics need citizens linked to a nation. See file header. */
  nationId: number;
}

export interface MarketGood {
  name: "Food";
  basePrice: number;
  price: number;
  delta: number;
  supply: number;
  demand: number;
}

export interface Nation {
  id: number;
  name: string;
  color: string;
  treasury: number;
  technology: number;
  atWarWith: number[];
  market: MarketGood[];
}

export interface EventLog {
  day: number;
  kind: "death" | "levelup" | "war" | "miracle" | "birth" | "system";
  text: string;
}

export interface WorldState {
  day: number;
  techEraIndex: number;
  people: Person[];
  nations: Nation[];
  eventLog: EventLog[];
  nextPersonId: number;
}

// ============================================================================
// tuning constants
// ============================================================================

const HUNGER_DECAY = 3;
const ENERGY_DECAY = 2;
const XP_PER_TICK: Record<JobClass, number> = { Farmer: 8, Scholar: 12, Merchant: 10 };
const TRAIT_UNLOCK_CHANCE_ON_LEVEL_UP = 0.25;
const FOOD_BASE_PRICE = 4;
const FOOD_OUTPUT_PER_FARMER = 1.4;
const FOOD_DEMAND_PER_CAPITA = 0.9;
const FOOD_SUPPLY_JITTER = 2;
const TECH_PER_SCHOLAR = 0.6;
const WEALTH_PER_MERCHANT = 2;
const WAR_BASE_CHANCE = 0.01;
const MAX_EVENT_LOG = 300;

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

function makeNation(id: number, name: string, color: string): Nation {
  return {
    id,
    name,
    color,
    treasury: 200,
    technology: 5,
    atWarWith: [],
    market: [
      { name: "Food", basePrice: FOOD_BASE_PRICE, price: FOOD_BASE_PRICE, delta: 0, supply: 100, demand: 100 },
    ],
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
  const nations = NATION_NAMES.map((name, i) => makeNation(i + 1, name, NATION_COLORS[i]));
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
  };
}

// ============================================================================
// 3. THE MASTER TICK SIMULATION MATH
// ============================================================================

function pushEvent(log: EventLog[], day: number, kind: EventLog["kind"], text: string): EventLog[] {
  const next = [...log, { day, kind, text }];
  return next.length > MAX_EVENT_LOG ? next.slice(next.length - MAX_EVENT_LOG) : next;
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

  // --- needs decay, XP/leveling, deaths ------------------------------------
  const people = state.people.map((person) => {
    if (!person.alive) return person;

    const hunger = clamp(person.hunger - HUNGER_DECAY, 0, 100);
    const energy = clamp(person.energy - ENERGY_DECAY, 0, 100);

    if (hunger <= 0) {
      eventLog = pushEvent(eventLog, day, "death", `${person.name} has died of starvation.`);
      return { ...person, hunger: 0, energy, alive: false, mood: 0 };
    }

    const mood = computeMood(hunger, energy, cosmicAge.moodModifier);

    // Self-Improvement XP Engine: working citizens earn XP every tick.
    let { level, xp, traits } = person;
    xp += XP_PER_TICK[person.job];
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

  const livingPopulation = people.filter((p) => p.alive).length;

  // --- Endless Sky-style market + national economy --------------------------
  const nations = state.nations.map((nation) => {
    const citizens = people.filter((p) => p.nationId === nation.id && p.alive);
    const farmers = citizens.filter((p) => p.job === "Farmer").length;
    const scholars = citizens.filter((p) => p.job === "Scholar").length;
    const merchants = citizens.filter((p) => p.job === "Merchant").length;

    const technology = nation.technology + scholars * TECH_PER_SCHOLAR;
    const treasury = nation.treasury + merchants * WEALTH_PER_MERCHANT;

    const market = nation.market.map((good) => {
      const jitter = (Math.random() * 2 - 1) * FOOD_SUPPLY_JITTER;
      const supply = Math.max(
        0,
        farmers * FOOD_OUTPUT_PER_FARMER * cosmicAge.cropEfficiency + jitter
      );
      const demand = Math.max(0, Math.round(citizens.length * FOOD_DEMAND_PER_CAPITA));
      const rawPrice = good.basePrice * (demand / Math.max(1, supply));
      const price = clamp(Math.round(rawPrice * 100) / 100, 1, 100);
      const delta = Math.round((price - good.price) * 100) / 100;
      return { ...good, supply, demand, price, delta };
    });

    return { ...nation, technology, treasury, market };
  });

  // --- Dynamic Aggression Events: cosmic-age-scaled random war declarations -
  let finalNations = nations;
  let finalEventLog = eventLog;
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
        finalEventLog = pushEvent(finalEventLog, day, "war", `${a.name} declared war on ${b.name}!`);
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
    finalEventLog = pushEvent(
      finalEventLog,
      day,
      "system",
      `The world has advanced into the ${TECH_ERAS[techEraIndex].name}.`
    );
  }

  return {
    day,
    techEraIndex,
    people,
    nations: finalNations,
    eventLog: finalEventLog,
    nextPersonId: state.nextPersonId,
  };
}

// ============================================================================
// 4. God-mode actions (pure, same shape as processSimulationTick)
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

// ============================================================================
// React hook
// ============================================================================

type EngineAction =
  | { type: "TICK" }
  | { type: "SPAWN_CITIZEN" }
  | { type: "CAST_BLESSING" };

function reducer(state: WorldState, action: EngineAction): WorldState {
  switch (action.type) {
    case "TICK":
      return processSimulationTick(state);
    case "SPAWN_CITIZEN":
      return spawnCitizen(state);
    case "CAST_BLESSING":
      return castBlessing(state);
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

  return { world, isRunning, setRunning: setIsRunning, spawnCitizenAction, castBlessingAction };
}
