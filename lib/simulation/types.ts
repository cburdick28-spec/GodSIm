// lib/simulation/types.ts
//
// Direct TypeScript port of SimGod's data model (originally Python
// dataclasses). snake_case -> camelCase, Optional[X] -> X | null,
// dataclass field(default_factory=...) -> plain typed properties.
//
// Deliberately NOT ported: World.terrain (procedural terrain generation is
// a separate concern from the simulation's state shape) and anything
// Plotly/Streamlit-specific (those are that script's rendering layer; this
// dashboard renders the same WorldState with React/Tailwind instead).

export type Season = "Spring" | "Summer" | "Autumn" | "Winter";

export type Weather =
  | "Clear"
  | "Sunny"
  | "Cloudy"
  | "Rainy"
  | "Windy"
  | "Stormy"
  | "Snowy"
  | "Foggy";

export type Sex = "M" | "F";

/** Free-text in the original (whatever `act()` last set it to), typed here
 * as the specific values the engine actually produces. */
export type PersonState =
  | "idle"
  | "alone"
  | "foraging"
  | "sleeping rough"
  | "washing up"
  | "playing"
  | "whispering a prayer"
  | `eating at ${string}`
  | `resting at home`
  | `enjoying the ${string}`
  | `talking with ${string}`
  | `praying`
  | `working as ${string}`
  | "touched by the divine"
  | "struck down"
  | "claimed by plague"
  | "collapsed"
  | "passed away"
  | "returned from death";

// --- content-table row shapes ------------------------------------------

export interface AgeDefinition {
  name: string;
  minPopulation: number;
  minTech: number;
  description: string;
}

export interface ReligionDefinition {
  name: string;
  description: string;
}

/** One row of the JOBS table. `moodBonus` and `produces` are carried over
 * from the source for fidelity but — same as in the original script —
 * aren't yet consumed anywhere in the tick loop; they're metadata for a
 * future economic pass. */
export interface JobDefinition {
  title: string;
  minAge: number;
  wage: number;
  moodBonus: number;
  produces: string | null;
}

export interface BuildingKindDefinition {
  cost: number;
  capacity: number;
}

// --- runtime entities -----------------------------------------------------

export interface Belief {
  religion: string | null;
  devotion: number; // 0-100
  doubting: boolean;
}

export interface Person {
  id: number;
  name: string;
  age: number;
  sex: Sex;
  alive: boolean;
  energy: number; // 0-100
  hunger: number; // 0-100
  fun: number; // 0-100
  hygiene: number; // 0-100
  social: number; // 0-100
  mood: number; // 0-100
  traits: string[];
  job: string;
  wage: number;
  wealth: number;
  belief: Belief;
  loyalty: number; // 0-100
  anger: number; // 0-100
  ambition: number; // 0-100
  /** personId -> affinity, -100..100 */
  relationships: Record<number, number>;
  partnerId: number | null;
  childrenIds: number[];
  parentIds: number[];
  x: number;
  y: number;
  nationId: number | null;
  state: PersonState;
  godLove: number; // 0-100
  godFear: number; // 0-100
}

export interface Building {
  id: number;
  name: string;
  kind: string;
  x: number;
  y: number;
  nationId: number | null;
  hp: number;
  builtDay: number;
}

export interface Nation {
  id: number;
  name: string;
  color: string;
  capital: [number, number];
  faith: string | null;
  culture: number;
  military: number;
  treasury: number;
  tech: number;
  stability: number; // 0-100
  atWarWith: number[];
  holidays: string[];
  foundedDay: number;
  motto: string;
}

export interface EventLog {
  day: number;
  hour: number;
  kind: string;
  text: string;
  nationId?: number | null;
  personId?: number | null;
}

/** One row of the world-history time series (World.record_history). */
export interface HistorySnapshot {
  day: number;
  population: number;
  averageMood: number;
  buildings: number;
  nations: number;
  age: string;
}

export interface WorldState {
  name: string;
  day: number;
  hour: number;
  weather: Weather;
  season: Season;
  ageIndex: number;
  people: Person[];
  buildings: Building[];
  nations: Nation[];
  events: EventLog[];
  nextPersonId: number;
  nextBuildingId: number;
  nextNationId: number;
  miraclesPerformed: number;
  smites: number;
  births: number;
  deaths: number;
  warsFought: number;
  history: HistorySnapshot[];
}
