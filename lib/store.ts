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

function makeMarket(seed: number) {
  return (Object.keys(GOOD_BASE_PRICES) as GoodName[]).map((name) => {
    const basePrice = GOOD_BASE_PRICES[name];
    const supply = 80 + seed * 7;
    const demand = 80 + seed * 5;
    return {
      name,
      basePrice,
      price: basePrice,
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
    let treasuryDelta = 0;

    const nations = s.nations.map((n) => {
      // --- market fluctuation: random walk on supply/demand, price follows ---
      const market = n.market.map((g) => {
        const supplyShock = (Math.random() - 0.5) * 10;
        const demandShock = (Math.random() - 0.5) * 10;
        const supply = Math.max(10, g.supply + supplyShock);
        const demand = Math.max(10, g.demand + demandShock);
        const ratio = demand / supply;
        const price = Math.max(0.5, g.basePrice * ratio);
        return { ...g, supply, demand, price: Math.round(price * 100) / 100 };
      });

      // --- population growth: base rate + trait modifiers, fed by Food surplus ---
      const food = market.find((g) => g.name === "Food");
      const foodSurplus = food ? food.supply - food.demand : 0;
      const foodFactor = foodSurplus >= 0 ? 0.002 : -0.002;
      const traitFactor = n.traits.reduce(
        (sum, t) => sum + t.populationModifier,
        0
      );
      const growthRate = 0.001 + foodFactor + traitFactor;
      const population = Math.max(
        0,
        Math.round(n.population * (1 + growthRate))
      );

      // --- tax revenue this tick ---
      const activeLawModifier = n.laws
        .filter((l) => l.active)
        .reduce((sum, l) => sum + l.taxModifier, 0);
      const effectiveTax = Math.min(1, Math.max(0, n.taxRate + activeLawModifier));
      const revenue = population * effectiveTax * 0.001;
      treasuryDelta += revenue;

      return {
        ...n,
        population,
        market,
        treasury: n.treasury + revenue,
      };
    });

    set({
      tick: s.tick + 1,
      balance: s.balance + treasuryDelta,
      nations,
    });
  },
}));
