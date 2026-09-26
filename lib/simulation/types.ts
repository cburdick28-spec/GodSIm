// lib/simulation/types.ts
//
// Fully-typed shape of the deeper WorldBox/Civ-style simulation layer
// (people, buildings, nations, ages) — translated from the Python
// prototype's data model into TypeScript. This sits alongside, and is
// designed to eventually feed, the simpler Nation/Market model in
// lib/store.ts and lib/types.ts.

export type Season = "Spring" | "Summer" | "Autumn" | "Winter";

export type Weather = "Clear" | "Rain" | "Storm" | "Snow" | "Drought";

/** A tradeable market resource. "Wealth" is handled separately (it flows
 * straight into treasuries rather than being bought/sold), so it is not a
 * MarketGood name. */
export type ResourceName = "Food" | "Iron" | "Luxury";

export type Sex = "male" | "female";

export type PersonState =
  | "idle"
  | "working"
  | "sleeping"
  | "socializing"
  | "fleeing"
  | "deceased";

// --- Content matrices (definitions, not runtime instances) --------------

export interface AgeDefinition {
  name: string;
  /** Minimum average national tech score required to enter this age. */
  techRequired: number;
  /** Minimum living world population required to enter this age. */
  popRequired: number;
}

export interface ReligionDefinition {
  name: string;
  /** How many devotion points a believer loses per day without practice. */
  devotionDecayPerDay: number;
}

export interface JobDefinition {
  name: string;
  /** Market resource this job produces, if any (Merchants produce none). */
  resource?: ResourceName;
  /** Units of `resource` generated per active worker, per tick. */
  outputPerWorker: number;
  /** Gold pieces generated per active worker, per tick, paid to their nation's treasury. */
  wealthPerWorker: number;
}

export interface BuildingKindDefinition {
  name: string;
  /** Resource cost to construct one of this building. */
  cost: Partial<Record<ResourceName, number>>;
  /** How many people this building can house/employ (0 = not a housing/work building). */
  capacity: number;
}

// --- Runtime entities -----------------------------------------------------

export interface Belief {
  religion: string | null;
  /** 0-100: how devout this person currently is. */
  devotion: number;
  /** True once devotion has decayed low enough that the person is wavering. */
  doubting: boolean;
}

export interface Person {
  id: number;
  name: string;
  age: number;
  sex: Sex;
  alive: boolean;
  /** 0-100 */
  energy: number;
  /** 0-100, 0 = starving to death */
  hunger: number;
  /** 0-100 */
  social: number;
  /** 0-100, derived each tick from energy/hunger/social */
  mood: number;
  job: string | null;
  wealth: number;
  traits: string[];
  belief: Belief;
  /** personId -> affinity, -100..100 */
  relationships: Record<number, number>;
  state: PersonState;
  /** 0-100: how much this person reveres the player-god */
  godLove: number;
  /** 0-100: how much this person fears the player-god */
  godFear: number;
}

export interface Building {
  id: number;
  name: string;
  kind: string;
  x: number;
  y: number;
  hp: number;
}

export interface Nation {
  id: number;
  name: string;
  color: string;
  capital: [number, number];
  faith: string | null;
  treasury: number;
  tech: number;
  /** 0-100 */
  stability: number;
  /** 0..1 fraction, same convention as lib/store.ts */
  taxRate: number;
  atWarWith: number[];
  motto: string;
}

export interface EventLog {
  day: number;
  hour: number;
  kind: string;
  text: string;
}

export interface MarketGood {
  name: ResourceName;
  basePrice: number;
  price: number;
  /** Change in `price` since the previous tick. */
  delta: number;
  supply: number;
  demand: number;
}

/** One row of the world-history time series, for charting. */
export interface HistorySnapshot {
  day: number;
  hour: number;
  totalPopulation: number;
  averageMood: number;
  activeNations: number;
}

/** Tunable knobs God Mode / Ruler Mode can alter at runtime. */
export interface SimulationSettings {
  /** % tax rate above which population growth starts tapering off. */
  taxSoftCapPercent: number;
  /** % tax rate above which population growth goes negative (unrest). */
  taxHardCapPercent: number;
  /** Baseline per-tick population growth rate (e.g. 0.0015 = +0.15%). */
  baseGrowthRate: number;
}

export interface WorldState {
  day: number;
  hour: number;
  season: Season;
  weather: Weather;
  /** Name of the current AgeDefinition. */
  age: string;
  settings: SimulationSettings;
  people: Person[];
  buildings: Building[];
  nations: Nation[];
  market: MarketGood[];
  events: EventLog[];
  history: HistorySnapshot[];
}
