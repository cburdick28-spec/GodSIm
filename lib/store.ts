// lib/store.ts
// Global simulation store (Zustand). One tick = one call to `advanceTick`.
// The UI drives ticks with a setInterval loop (see app/page.tsx); this file
// only holds state + pure-ish reducers so the simulation logic is testable
// independent of React.
//
// npm i zustand

import { create } from "zustand";
import type { GameMode, GoodName, Nation, Trait } from "./types";

const GOOD_BASE_PRICES: Record<GoodName, number> = {
  Food: 4,
  Iron: 9,
  Luxury: 25,
};

// Simulation constants — pulled out of `advanceTick` so the formulas below
// read the same as the spec and are easy to tune in one place.
const BASE_GROWTH_RATE = 0.0015; // +0.15% per tick, baseline
const TAX_SOFT_CAP = 25; // % — above this, growth starts tapering off
const TAX_HARD_CAP = 70; // % — above this, growth is negative (unrest)
const CONSCRIPTION_GROWTH_MULTIPLIER = 0.5; // halves natural growth
const TREASURY_TAX_YIELD = 0.05; // gp per (population * taxRate) per tick
const TARIFF_FLAT_BONUS = 5; // gp/tick while Trade Tariffs is active
const SUPPLY_JITTER = 3; // supply randomizes by +/- this many units
const DEMAND_PER_CAPITA = 0.0007; // demand = population * this
const MIN_PRICE = 1;
const MAX_PRICE = 100;

// God Mode "Divine Intervention" trait names + their mechanical effects.
// These are matched by name in `advanceTick` rather than using the generic
// `populationModifier` field, since each does something structurally
// different (a growth multiplier, a flat decay, a revenue multiplier)
// rather than a simple additive nudge.
export const DIVINE_BLESSING = "Divine Blessing";
export const BUBONIC_PLAGUE = "Bubonic Plague";
export const GOLDEN_AGE = "Golden Age";

const DIVINE_BLESSING_GROWTH_MULTIPLIER = 2; // doubles growth speed
const BUBONIC_PLAGUE_DECAY = 0.95; // -5% population, every tick it's active
const GOLDEN_AGE_TAX_MULTIPLIER = 2; // doubles tax revenue

function makeMarket(seed: number) {
  return (Object.keys(GOOD_BASE_PRICES) as GoodName[]).map((name) => {
    const basePrice = GOOD_BASE_PRICES[name];
    const supply = 80 + seed * 7;
    const demand = 80 + seed * 5;
    return {
      name,
      basePrice,
      price: basePrice,
      delta: 0,
      supply,
      demand,
    };
  });
}

function makeNation(id: string, name: string, population: number, seed: number): Nation {
  return {
    id,
    name,
    population,
    taxRate: 0.1,
    treasury: 500,
    laws: [
      {
        id: `${id}-law-tariffs`,
        name: "Trade Tariffs",
        description: "Levy a duty on imported Luxury goods.",
        active: false,
        taxModifier: 0.02,
      },
      {
        id: `${id}-law-conscription`,
        name: "Conscription",
        description: "Compel citizens into military service, slowing growth.",
        active: false,
        taxModifier: 0,
      },
      {
        id: `${id}-law-free-market`,
        name: "Free Market Charter",
        description: "Remove price controls; supply/demand swings widen.",
        active: false,
        taxModifier: -0.01,
      },
    ],
    traits: [],
    market: makeMarket(seed),
  };
}

interface GameStore {
  tick: number;
  balance: number;
  mode: GameMode;
  isRunning: boolean;
  selectedNationId: string | null;
  nations: Nation[];

  // --- global controls ---
  toggleMode: () => void;
  setRunning: (running: boolean) => void;
  advanceTick: () => void;
  selectNation: (id: string) => void;

  // --- ruler mode actions ---
  toggleLaw: (nationId: string, lawId: string) => void;
  setTaxRate: (nationId: string, rate: number) => void;

  // --- god mode actions ---
  setPopulation: (nationId: string, population: number) => void;
  adjustPopulation: (nationId: string, delta: number) => void;
  addTreasury: (nationId: string, amount: number) => void;
  addTrait: (nationId: string, traitName: string, populationModifier: number) => void;
  removeTrait: (nationId: string, traitId: string) => void;
}

const initialNations: Nation[] = [
  makeNation("valdoria", "Valdoria", 128_400, 1),
  makeNation("kestrel-isles", "Kestrel Isles", 46_900, 2),
  makeNation("ashgard", "Ashgard", 212_100, 3),
];

export const useGameStore = create<GameStore>((set, get) => ({
  tick: 0,
  balance: 10_000,
  mode: "ruler",
  isRunning: true,
  selectedNationId: initialNations[0].id,
  nations: initialNations,

  toggleMode: () =>
    set((s) => ({ mode: s.mode === "ruler" ? "god" : "ruler" })),

  setRunning: (running) => set({ isRunning: running }),

  selectNation: (id) => set({ selectedNationId: id }),

  toggleLaw: (nationId, lawId) =>
    set((s) => ({
      nations: s.nations.map((n) =>
        n.id !== nationId
          ? n
          : {
              ...n,
              laws: n.laws.map((l) =>
                l.id === lawId ? { ...l, active: !l.active } : l
              ),
            }
      ),
    })),

  setTaxRate: (nationId, rate) =>
    set((s) => ({
      nations: s.nations.map((n) =>
        n.id === nationId
          ? { ...n, taxRate: Math.min(1, Math.max(0, rate)) }
          : n
      ),
    })),

  setPopulation: (nationId, population) =>
    set((s) => ({
      nations: s.nations.map((n) =>
        n.id === nationId
          ? { ...n, population: Math.max(0, Math.round(population)) }
          : n
      ),
    })),

  adjustPopulation: (nationId, delta) =>
    set((s) => ({
      nations: s.nations.map((n) =>
        n.id === nationId
          ? { ...n, population: Math.max(0, Math.round(n.population + delta)) }
          : n
      ),
    })),

  addTreasury: (nationId, amount) =>
    set((s) => ({
      nations: s.nations.map((n) =>
        n.id === nationId
          ? { ...n, treasury: Math.max(0, n.treasury + amount) }
          : n
      ),
    })),

  addTrait: (nationId, traitName, populationModifier) =>
    set((s) => {
      const trait: Trait = {
        id: `${nationId}-trait-${Date.now()}`,
        name: traitName,
        appliedAtTick: s.tick,
        populationModifier,
      };
      return {
        nations: s.nations.map((n) =>
          n.id === nationId ? { ...n, traits: [...n.traits, trait] } : n
        ),
      };
    }),

  removeTrait: (nationId, traitId) =>
    set((s) => ({
      nations: s.nations.map((n) =>
        n.id !== nationId
          ? n
          : { ...n, traits: n.traits.filter((t) => t.id !== traitId) }
      ),
    })),

  advanceTick: () => {
    const s = get();
    let globalRevenue = 0;

    const nations = s.nations.map((n) => {
      const tariffsActive = n.laws.some(
        (l) => l.name === "Trade Tariffs" && l.active
      );
      const conscriptionActive = n.laws.some(
        (l) => l.name === "Conscription" && l.active
      );

      // --- 1. Population dynamics -------------------------------------
      const hasBlessing = n.traits.some((t) => t.name === DIVINE_BLESSING);
      const hasPlague = n.traits.some((t) => t.name === BUBONIC_PLAGUE);
      const hasGoldenAge = n.traits.some((t) => t.name === GOLDEN_AGE);

      const taxRatePercent = n.taxRate * 100;

      // Linear taper: full +0.15% growth up to the 25% soft cap, falling
      // to 0% at the 70% hard cap, and continuing negative (unrest) past
      // it — one straight line covers "slows down" and "starts declining".
      // Golden Age exempts the city from this unrest/unhappiness penalty
      // entirely, so it always gets the full base growth rate here.
      let growthRate = hasGoldenAge
        ? BASE_GROWTH_RATE
        : taxRatePercent <= TAX_SOFT_CAP
        ? BASE_GROWTH_RATE
        : BASE_GROWTH_RATE *
          (1 - (taxRatePercent - TAX_SOFT_CAP) / (TAX_HARD_CAP - TAX_SOFT_CAP));

      if (conscriptionActive) {
        growthRate *= CONSCRIPTION_GROWTH_MULTIPLIER;
      }

      // Divine Blessing doubles whatever growth speed the city currently has.
      if (hasBlessing) {
        growthRate *= DIVINE_BLESSING_GROWTH_MULTIPLIER;
      }

      // Custom/freeform traits (added via the God Mode text box) still layer
      // on additively; the three named Divine Intervention traits above
      // carry populationModifier 0 since their effects are special-cased.
      const traitFactor = n.traits.reduce(
        (sum, t) => sum + t.populationModifier,
        0
      );
      growthRate += traitFactor;

      let population = Math.max(0, Math.round(n.population * (1 + growthRate)));

      // Bubonic Plague slashes population by a flat 5% every tick it's
      // active, on top of (i.e. applied after) ordinary growth.
      if (hasPlague) {
        population = Math.max(0, Math.round(population * BUBONIC_PLAGUE_DECAY));
      }

      // --- 2. Treasury & tax collection --------------------------------
      let taxRevenue = population * n.taxRate * TREASURY_TAX_YIELD;
      if (hasGoldenAge) {
        taxRevenue *= GOLDEN_AGE_TAX_MULTIPLIER;
      }
      const tariffRevenue = tariffsActive ? TARIFF_FLAT_BONUS : 0;
      const revenue = taxRevenue + tariffRevenue;
      globalRevenue += revenue;
      const treasury = n.treasury + revenue;

      // --- 3. Market engine (Endless Sky-style scarcity pricing) -------
      const market = n.market.map((g) => {
        const supplyShock = (Math.random() * 2 - 1) * SUPPLY_JITTER; // +/-3
        const supply = Math.max(0, g.supply + supplyShock);
        const demand = Math.max(0, Math.round(population * DEMAND_PER_CAPITA));

        const rawPrice = g.basePrice * (demand / Math.max(1, supply));
        const price = Math.min(
          MAX_PRICE,
          Math.max(MIN_PRICE, Math.round(rawPrice * 100) / 100)
        );
        const delta = Math.round((price - g.price) * 100) / 100;

        return { ...g, supply, demand, price, delta };
      });

      return {
        ...n,
        population,
        treasury,
        market,
      };
    });

    set({
      tick: s.tick + 1,
      balance: s.balance + globalRevenue,
      nations,
    });
  },
}));
