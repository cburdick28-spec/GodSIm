// lib/simulation/engine.ts
//
// The master state loop ("Engine Core"), translated from the Python
// script's per-tick update pass into a pure TypeScript reducer:
// `simulationTick(state) => WorldState`. Kept side-effect-free (aside from
// Math.random for weather/jitter) so it's easy to reason about, test, and
// drive from a plain setInterval via the useSimulationEngine hook.

import {
  AGES,
  DEMAND_PER_CAPITA,
  JOBS,
  MARKET_BASE_PRICES,
  SEASONS,
  SEASON_LENGTH_DAYS,
  WEATHERS,
} from "./constants";
import type {
  Building,
  EventLog,
  HistorySnapshot,
  MarketGood,
  Nation,
  Person,
  ResourceName,
  WorldState,
} from "./types";

// --- tuning constants -----------------------------------------------------

const HUNGER_DECAY_PER_TICK = 1.2;
const ENERGY_DECAY_PER_TICK = 0.8;
const SOCIAL_DECAY_PER_TICK = 0.6;

const MOOD_WEIGHTS = { hunger: 0.4, energy: 0.35, social: 0.25 } as const;

const SUPPLY_JITTER = 3; // +/- units of natural production drift per tick
const MIN_PRICE = 1;
const MAX_PRICE = 100;

const TREASURY_TAX_YIELD = 0.05; // gp per (population * taxRate) per tick

/** How many history rows to retain — enough for a meaningful chart without
 * the array growing unbounded over a long session. */
const MAX_HISTORY_LENGTH = 2000;

export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

// --- 1. Time -----------------------------------------------------------

function advanceTime(state: WorldState): Pick<
  WorldState,
  "hour" | "day" | "season" | "weather"
> & { rolledOverDay: boolean } {
  let { hour, day } = state;
  let { season, weather } = state;
  let rolledOverDay = false;

  hour += 1;
  if (hour >= 24) {
    hour = 0;
    day += 1;
    rolledOverDay = true;

    const seasonIndex = Math.floor(day / SEASON_LENGTH_DAYS) % SEASONS.length;
    season = SEASONS[seasonIndex];

    // Weather re-rolls once per day rather than every hour.
    weather = WEATHERS[Math.floor(Math.random() * WEATHERS.length)];
  }

  return { hour, day, season, weather, rolledOverDay };
}

// --- 2. People needs ------------------------------------------------------

function computeMood(person: Pick<Person, "hunger" | "energy" | "social">) {
  return clamp(
    Math.round(
      person.hunger * MOOD_WEIGHTS.hunger +
        person.energy * MOOD_WEIGHTS.energy +
        person.social * MOOD_WEIGHTS.social
    ),
    0,
    100
  );
}

function updatePeopleNeeds(
  people: Person[],
  day: number,
  hour: number,
  events: EventLog[]
): Person[] {
  return people.map((person) => {
    if (!person.alive) return person;

    const sleeping = person.state === "sleeping";
    const hunger = clamp(person.hunger - HUNGER_DECAY_PER_TICK, 0, 100);
    const energy = clamp(
      person.energy - (sleeping ? -ENERGY_DECAY_PER_TICK * 2 : ENERGY_DECAY_PER_TICK),
      0,
      100
    );
    const social = clamp(person.social - SOCIAL_DECAY_PER_TICK, 0, 100);

    if (hunger <= 0) {
      events.push({
        day,
        hour,
        kind: "death",
        text: `${person.name} has died of starvation.`,
      });
      return {
        ...person,
        hunger: 0,
        alive: false,
        state: "deceased",
        mood: 0,
      };
    }

    return {
      ...person,
      hunger,
      energy,
      social,
      mood: computeMood({ hunger, energy, social }),
    };
  });
}

// --- 3. Endless Sky-style economic tick -----------------------------------

function updateMarket(
  market: MarketGood[],
  people: Person[],
  totalPopulation: number
): MarketGood[] {
  // Aggregate output-per-tick for each tradeable resource from active
  // workers (alive people currently doing that job).
  const outputByResource: Partial<Record<ResourceName, number>> = {};
  for (const person of people) {
    if (!person.alive || !person.job) continue;
    const jobDef = JOBS[person.job];
    if (!jobDef?.resource) continue;
    outputByResource[jobDef.resource] =
      (outputByResource[jobDef.resource] ?? 0) + jobDef.outputPerWorker;
  }

  return market.map((g) => {
    const workerOutput = outputByResource[g.name] ?? 0;
    const naturalJitter = (Math.random() * 2 - 1) * SUPPLY_JITTER;
    const supply = Math.max(0, g.supply + workerOutput + naturalJitter);

    const demand = Math.max(
      0,
      Math.round(totalPopulation * DEMAND_PER_CAPITA[g.name])
    );

    const rawPrice = g.basePrice * (demand / Math.max(1, supply));
    const price = clamp(Math.round(rawPrice * 100) / 100, MIN_PRICE, MAX_PRICE);
    const delta = Math.round((price - g.price) * 100) / 100;

    return { ...g, supply, demand, price, delta };
  });
}

/**
 * Merchants (and any job's `wealthPerWorker`) pay straight into the
 * treasury, on top of ordinary population tax. Also applies stability
 * drift from the tax-rate thresholds in `settings`: since population here
 * is modeled as individual people rather than a single counter, high tax
 * erodes national *stability* (using the same soft-cap/hard-cap taper
 * shape lib/store.ts uses for population growth) instead of growth speed.
 */
function updateTreasuries(
  nations: Nation[],
  people: Person[],
  totalPopulation: number,
  settings: WorldState["settings"]
): Nation[] {
  const wealthGenerated = people.reduce((sum, person) => {
    if (!person.alive || !person.job) return sum;
    const jobDef = JOBS[person.job];
    return sum + (jobDef?.wealthPerWorker ?? 0);
  }, 0);

  // Without a settlement/citizenship model yet, wealth generated this tick
  // is split evenly across nations — a placeholder until people are
  // assigned to a specific nation.
  const perNationWealth = nations.length > 0 ? wealthGenerated / nations.length : 0;

  return nations.map((n) => {
    const taxRevenue = totalPopulation * n.taxRate * TREASURY_TAX_YIELD;
    const taxRatePercent = n.taxRate * 100;

    let stabilityDelta = 0.05; // slow natural recovery toward full stability
    if (taxRatePercent > settings.taxHardCapPercent) {
      stabilityDelta = -0.6;
    } else if (taxRatePercent > settings.taxSoftCapPercent) {
      const span = settings.taxHardCapPercent - settings.taxSoftCapPercent;
      const overage = taxRatePercent - settings.taxSoftCapPercent;
      stabilityDelta = -0.3 * (overage / Math.max(1, span));
    }

    return {
      ...n,
      treasury: n.treasury + perNationWealth + taxRevenue,
      stability: clamp(n.stability + stabilityDelta, 0, 100),
    };
  });
}

// --- 4. History tracking ---------------------------------------------------

function recordHistory(
  history: HistorySnapshot[],
  snapshot: HistorySnapshot
): HistorySnapshot[] {
  const next = [...history, snapshot];
  return next.length > MAX_HISTORY_LENGTH
    ? next.slice(next.length - MAX_HISTORY_LENGTH)
    : next;
}

// --- 5. Age transitions ------------------------------------------------

function evaluateAgeTransition(
  nations: Nation[],
  totalPopulation: number,
  currentAge: string,
  day: number,
  hour: number,
  events: EventLog[]
): string {
  const averageTech =
    nations.length > 0
      ? nations.reduce((sum, n) => sum + n.tech, 0) / nations.length
      : 0;

  // Walk the age list from the top; the first one the world qualifies for
  // (highest tech/pop requirements it meets) is the target age.
  let targetAge = AGES[0].name;
  for (const ageDef of AGES) {
    if (totalPopulation >= ageDef.popRequired && averageTech >= ageDef.techRequired) {
      targetAge = ageDef.name;
    }
  }

  if (targetAge !== currentAge) {
    events.push({
      day,
      hour,
      kind: "age-transition",
      text: `The world has entered the ${targetAge}.`,
    });
  }

  return targetAge;
}

// --- Engine core: one tick -------------------------------------------------

export function simulationTick(state: WorldState): WorldState {
  const events: EventLog[] = [...state.events];

  const { hour, day, season, weather } = advanceTime(state);

  const people = updatePeopleNeeds(state.people, day, hour, events);
  const totalPopulation = people.filter((p) => p.alive).length;
  const averageMood =
    totalPopulation > 0
      ? Math.round(
          people.reduce((sum, p) => sum + (p.alive ? p.mood : 0), 0) /
            totalPopulation
        )
      : 0;

  const market = updateMarket(state.market, people, totalPopulation);
  const nations = updateTreasuries(
    state.nations,
    people,
    totalPopulation,
    state.settings
  );

  const age = evaluateAgeTransition(
    nations,
    totalPopulation,
    state.age,
    day,
    hour,
    events
  );

  const activeNations = nations.filter((n) => n.stability > 0).length;

  const history = recordHistory(state.history, {
    day,
    hour,
    totalPopulation,
    averageMood,
    activeNations,
  });

  return {
    ...state,
    hour,
    day,
    season,
    weather,
    age,
    people,
    market,
    nations,
    history,
    events,
  };
}

// --- Initial state factory --------------------------------------------

let nextPersonId = 1;
let nextBuildingId = 1;
let nextNationId = 1;

function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: nextPersonId++,
    name: overrides.name ?? `Citizen ${nextPersonId}`,
    age: 20,
    sex: "female",
    alive: true,
    energy: 80,
    hunger: 80,
    social: 80,
    mood: 80,
    job: null,
    wealth: 0,
    traits: [],
    belief: { religion: null, devotion: 0, doubting: false },
    relationships: {},
    state: "idle",
    godLove: 10,
    godFear: 0,
    ...overrides,
  };
}

/** Constructs a new Building instance of the given kind at (x, y). Not
 * wired into the tick loop yet (there's no construction-queue mechanic in
 * this pass), but exposed for God Mode / Ruler Mode actions to call directly. */
export function createBuilding(
  kind: string,
  x: number,
  y: number
): Building {
  return { id: nextBuildingId++, name: kind, kind, x, y, hp: 100 };
}

function makeMarketGoods(): MarketGood[] {
  return (Object.keys(MARKET_BASE_PRICES) as ResourceName[]).map((name) => ({
    name,
    basePrice: MARKET_BASE_PRICES[name],
    price: MARKET_BASE_PRICES[name],
    delta: 0,
    supply: 100,
    demand: 100,
  }));
}

export function createInitialWorldState(): WorldState {
  const nations: Nation[] = [
    {
      id: nextNationId++,
      name: "Valdoria",
      color: "#f59e0b",
      capital: [12, 8],
      faith: null,
      treasury: 500,
      tech: 5,
      stability: 80,
      taxRate: 0.1,
      atWarWith: [],
      motto: "Strength Through Unity",
    },
  ];

  const people: Person[] = Array.from({ length: 20 }, (_, i) =>
    makePerson({
      name: `Citizen ${i + 1}`,
      job: i % 4 === 0 ? "Farmer" : i % 4 === 1 ? "Miner" : i % 4 === 2 ? "Merchant" : "Artisan",
      state: "working",
    })
  );

  return {
    day: 0,
    hour: 0,
    season: SEASONS[0],
    weather: WEATHERS[0],
    age: AGES[0].name,
    settings: {
      taxSoftCapPercent: 25,
      taxHardCapPercent: 70,
      baseGrowthRate: 0.0015,
    },
    people,
    buildings: [],
    nations,
    market: makeMarketGoods(),
    events: [],
    history: [],
  };
}

