// lib/types.ts
// Shared domain types for the GodSim simulation.

export type GameMode = "ruler" | "god";

export type GoodName = "Food" | "Iron" | "Luxury";

export interface GoodPrice {
  name: GoodName;
  basePrice: number;
  price: number;
  supply: number; // units available this tick
  demand: number; // units requested this tick
}

export interface Law {
  id: string;
  name: string;
  description: string;
  active: boolean;
  /** Tax modifier applied while active, e.g. 0.02 = +2% tax cap */
  taxModifier: number;
}

export interface Trait {
  id: string;
  name: string;
  appliedAtTick: number;
  /** Rough effect on next-tick population growth, e.g. Plague = -0.05 */
  populationModifier: number;
}

export interface Nation {
  id: string;
  name: string;
  population: number;
  taxRate: number; // 0..1
  treasury: number;
  laws: Law[];
  traits: Trait[];
  market: GoodPrice[];
}

export interface GameState {
  tick: number;
  balance: number;
  mode: GameMode;
  isRunning: boolean;
  selectedNationId: string | null;
  nations: Nation[];
}
