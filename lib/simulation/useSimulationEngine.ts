// lib/simulation/useSimulationEngine.ts
//
// React hook wrapper around the pure `simulationTick` reducer. Mirrors the
// pattern used by the Zustand store in lib/store.ts: a single interval
// drives one dispatch per tick, and every God Mode / Ruler Mode action is a
// small, type-safe reducer case rather than ad hoc setState calls scattered
// through components — so components stay simple, and every state change
// (scripted or from a tick) flows through the same, testable reducer.

import { useCallback, useEffect, useReducer, useState } from "react";
import { clamp, createInitialWorldState, simulationTick } from "./engine";
import type { Person, WorldState } from "./types";

// --- action types -----------------------------------------------------

type EngineAction =
  | { type: "TICK" }
  | { type: "SET_PERSON_FIELD"; personId: number; patch: Partial<Person> }
  | { type: "ADD_TRAIT_TO_PERSON"; personId: number; trait: string }
  | { type: "REMOVE_TRAIT_FROM_PERSON"; personId: number; trait: string }
  /** WorldBox-style global sandbox effect: apply a trait to every living
   * person at once (e.g. a world-spanning Plague or Blessing). */
  | { type: "ADD_TRAIT_TO_ALL_LIVING"; trait: string }
  | { type: "SET_NATION_TAX_RATE"; nationId: number; rate: number }
  | { type: "ADD_TREASURY"; nationId: number; amount: number }
  | {
      type: "SET_TAX_THRESHOLDS";
      softCapPercent: number;
      hardCapPercent: number;
    };

function withTrait(traits: string[], trait: string): string[] {
  return traits.includes(trait) ? traits : [...traits, trait];
}

function worldReducer(state: WorldState, action: EngineAction): WorldState {
  switch (action.type) {
    case "TICK":
      return simulationTick(state);

    case "SET_PERSON_FIELD":
      return {
        ...state,
        people: state.people.map((p) =>
          p.id === action.personId ? { ...p, ...action.patch } : p
        ),
      };

    case "ADD_TRAIT_TO_PERSON":
      return {
        ...state,
        people: state.people.map((p) =>
          p.id === action.personId
            ? { ...p, traits: withTrait(p.traits, action.trait) }
            : p
        ),
      };

    case "REMOVE_TRAIT_FROM_PERSON":
      return {
        ...state,
        people: state.people.map((p) =>
          p.id === action.personId
            ? { ...p, traits: p.traits.filter((t) => t !== action.trait) }
            : p
        ),
      };

    case "ADD_TRAIT_TO_ALL_LIVING":
      return {
        ...state,
        people: state.people.map((p) =>
          p.alive ? { ...p, traits: withTrait(p.traits, action.trait) } : p
        ),
      };

    case "SET_NATION_TAX_RATE":
      return {
        ...state,
        nations: state.nations.map((n) =>
          n.id === action.nationId
            ? { ...n, taxRate: clamp(action.rate, 0, 1) }
            : n
        ),
      };

    case "ADD_TREASURY":
      return {
        ...state,
        nations: state.nations.map((n) =>
          n.id === action.nationId
            ? { ...n, treasury: Math.max(0, n.treasury + action.amount) }
            : n
        ),
      };

    case "SET_TAX_THRESHOLDS":
      return {
        ...state,
        settings: {
          ...state.settings,
          taxSoftCapPercent: action.softCapPercent,
          taxHardCapPercent: action.hardCapPercent,
        },
      };

    default:
      return state;
  }
}

export interface UseSimulationEngineResult {
  world: WorldState;
  isRunning: boolean;
  setRunning: (running: boolean) => void;

  // --- God Mode / Ruler Mode dispatch surface ---------------------------
  setPersonField: (personId: number, patch: Partial<Person>) => void;
  addTraitToPerson: (personId: number, trait: string) => void;
  removeTraitFromPerson: (personId: number, trait: string) => void;
  addTraitToAllLiving: (trait: string) => void;
  setNationTaxRate: (nationId: number, rate: number) => void;
  addTreasury: (nationId: number, amount: number) => void;
  setTaxThresholds: (softCapPercent: number, hardCapPercent: number) => void;
}

/**
 * Drives the world-simulation engine: one `simulationTick` per interval
 * while `isRunning` is true, plus a stable set of dispatchers for direct
 * sandbox edits. Every dispatcher is wrapped in `useCallback` with an empty
 * dependency array — `dispatch` from `useReducer` is referentially stable
 * for the lifetime of the component, so none of these ever go stale and
 * none of them need to appear in the tick effect's dependency array.
 */
export function useSimulationEngine(
  tickIntervalMs = 1000
): UseSimulationEngineResult {
  const [world, dispatch] = useReducer(worldReducer, undefined, createInitialWorldState);
  const [isRunning, setIsRunning] = useState(true);

  // Same pattern as app/page.tsx's nation tick loop: the effect's only
  // dependency is `isRunning`, so pause/resume is the only thing that ever
  // tears down and recreates the interval. Ticking dispatches an action but
  // never touches `isRunning`, so it can't retrigger this effect itself.
  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => dispatch({ type: "TICK" }), tickIntervalMs);
    return () => clearInterval(id);
  }, [isRunning, tickIntervalMs]);

  const setPersonField = useCallback(
    (personId: number, patch: Partial<Person>) =>
      dispatch({ type: "SET_PERSON_FIELD", personId, patch }),
    []
  );

  const addTraitToPerson = useCallback(
    (personId: number, trait: string) =>
      dispatch({ type: "ADD_TRAIT_TO_PERSON", personId, trait }),
    []
  );

  const removeTraitFromPerson = useCallback(
    (personId: number, trait: string) =>
      dispatch({ type: "REMOVE_TRAIT_FROM_PERSON", personId, trait }),
    []
  );

  const addTraitToAllLiving = useCallback(
    (trait: string) => dispatch({ type: "ADD_TRAIT_TO_ALL_LIVING", trait }),
    []
  );

  const setNationTaxRate = useCallback(
    (nationId: number, rate: number) =>
      dispatch({ type: "SET_NATION_TAX_RATE", nationId, rate }),
    []
  );

  const addTreasury = useCallback(
    (nationId: number, amount: number) =>
      dispatch({ type: "ADD_TREASURY", nationId, amount }),
    []
  );

  const setTaxThresholds = useCallback(
    (softCapPercent: number, hardCapPercent: number) =>
      dispatch({ type: "SET_TAX_THRESHOLDS", softCapPercent, hardCapPercent }),
    []
  );

  return {
    world,
    isRunning,
    setRunning: setIsRunning,
    setPersonField,
    addTraitToPerson,
    removeTraitFromPerson,
    addTraitToAllLiving,
    setNationTaxRate,
    addTreasury,
    setTaxThresholds,
  };
}
