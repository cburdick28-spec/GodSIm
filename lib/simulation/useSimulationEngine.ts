// lib/simulation/useSimulationEngine.ts
//
// React hook wrapper around the ported SimGod engine (engine.ts). The
// source is a Streamlit app: time only advances when the person clicks
// "1h" / "6h" / "24h" / "Run Nh", there's no autoplay. This hook preserves
// that as the default (advanceHours is just a dispatch, called on demand)
// but also supports optional autoplay via `autoTickMs`, using the same
// stale-closure-safe pattern as the rest of this dashboard: the tick
// interval's only effect dependency is `isRunning`, and every dispatcher
// is a stable `useCallback` wrapping the reducer's stable `dispatch`.

import { useCallback, useEffect, useReducer, useState } from "react";
import {
  advanceHours,
  godAdvanceAge,
  godBless,
  godConvert,
  godFertilityBoom,
  godMakePeace,
  godPlague,
  godRainWealth,
  godResurrect,
  godSmite,
  godSpawnNation,
  godStartWar,
  godTerraform,
  seedWorld,
} from "./engine";
import type { WorldState } from "./types";

type EngineAction =
  | { type: "ADVANCE_HOURS"; hours: number }
  | { type: "BLESS"; personId: number; amount?: number }
  | { type: "SMITE"; personId: number }
  | { type: "PLAGUE"; nationId: number }
  | { type: "FERTILITY_BOOM"; nationId: number }
  | { type: "TERRAFORM"; kind: string; x: number; y: number }
  | { type: "CONVERT"; nationId: number; religion: string }
  | { type: "RAIN_WEALTH"; nationId: number; amount?: number }
  | { type: "START_WAR"; aId: number; bId: number }
  | { type: "MAKE_PEACE" }
  | { type: "RESURRECT"; personId: number }
  | { type: "ADVANCE_AGE" }
  | { type: "SPAWN_NATION"; name: string }
  | { type: "NEW_WORLD" };

interface EngineState {
  world: WorldState;
  /** Last god-power result message — mirrors the source's st.session_state
   * "flash" messages (success/error/warning banners after an action). */
  lastMessage: string | null;
}

function reducer(state: EngineState, action: EngineAction): EngineState {
  switch (action.type) {
    case "ADVANCE_HOURS":
      return { world: advanceHours(state.world, action.hours), lastMessage: state.lastMessage };
    case "BLESS": {
      const { world, message } = godBless(state.world, action.personId, action.amount);
      return { world, lastMessage: message };
    }
    case "SMITE": {
      const { world, message } = godSmite(state.world, action.personId);
      return { world, lastMessage: message };
    }
    case "PLAGUE": {
      const { world, message } = godPlague(state.world, action.nationId);
      return { world, lastMessage: message };
    }
    case "FERTILITY_BOOM": {
      const { world, message } = godFertilityBoom(state.world, action.nationId);
      return { world, lastMessage: message };
    }
    case "TERRAFORM": {
      const { world, message } = godTerraform(state.world, action.kind, action.x, action.y);
      return { world, lastMessage: message };
    }
    case "CONVERT": {
      const { world, message } = godConvert(state.world, action.nationId, action.religion);
      return { world, lastMessage: message };
    }
    case "RAIN_WEALTH": {
      const { world, message } = godRainWealth(state.world, action.nationId, action.amount);
      return { world, lastMessage: message };
    }
    case "START_WAR": {
      const { world, message } = godStartWar(state.world, action.aId, action.bId);
      return { world, lastMessage: message };
    }
    case "MAKE_PEACE": {
      const { world, message } = godMakePeace(state.world);
      return { world, lastMessage: message };
    }
    case "RESURRECT": {
      const { world, message } = godResurrect(state.world, action.personId);
      return { world, lastMessage: message };
    }
    case "ADVANCE_AGE": {
      const { world, message } = godAdvanceAge(state.world);
      return { world, lastMessage: message };
    }
    case "SPAWN_NATION": {
      const { world, message } = godSpawnNation(state.world, action.name);
      return { world, lastMessage: message };
    }
    case "NEW_WORLD":
      return { world: seedWorld(), lastMessage: "A new world breathes its first." };
    default:
      return state;
  }
}

export interface UseSimulationEngineOptions {
  /** If set, auto-advances one hour every `autoTickMs` while `isRunning` is
   * true. Left unset by default to match the source's manual, button-driven
   * time controls — pass e.g. 1000 for continuous real-time ticking. */
  autoTickMs?: number;
}

export interface UseSimulationEngineResult {
  world: WorldState;
  lastMessage: string | null;
  isRunning: boolean;
  setRunning: (running: boolean) => void;

  // --- time controls ("▶ 1h" / "▶▶ 6h" / "▶▶▶ 24h" / "Run Nh") -----------
  advanceHours: (hours: number) => void;

  // --- the 12 god powers --------------------------------------------------
  bless: (personId: number, amount?: number) => void;
  smite: (personId: number) => void;
  plague: (nationId: number) => void;
  fertilityBoom: (nationId: number) => void;
  terraform: (kind: string, x: number, y: number) => void;
  convert: (nationId: number, religion: string) => void;
  rainWealth: (nationId: number, amount?: number) => void;
  startWar: (aId: number, bId: number) => void;
  makePeace: () => void;
  resurrect: (personId: number) => void;
  advanceAge: () => void;
  spawnNation: (name: string) => void;

  // --- session control ("🔄 New World") -----------------------------------
  newWorld: () => void;
}

export function useSimulationEngine(
  options: UseSimulationEngineOptions = {}
): UseSimulationEngineResult {
  const { autoTickMs } = options;
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    world: seedWorld(),
    lastMessage: null,
  }));
  const [isRunning, setIsRunning] = useState(false);

  // Optional autoplay. `dispatch` is stable, so the effect's only real
  // dependency is `isRunning` (and `autoTickMs`, which is expected to be a
  // constant passed once) — ticking dispatches an action but never touches
  // either, so it can never retrigger this effect itself.
  useEffect(() => {
    if (!isRunning || !autoTickMs) return;
    const id = setInterval(() => dispatch({ type: "ADVANCE_HOURS", hours: 1 }), autoTickMs);
    return () => clearInterval(id);
  }, [isRunning, autoTickMs]);

  const advanceHoursAction = useCallback(
    (hours: number) => dispatch({ type: "ADVANCE_HOURS", hours }),
    []
  );
  const bless = useCallback(
    (personId: number, amount?: number) => dispatch({ type: "BLESS", personId, amount }),
    []
  );
  const smite = useCallback((personId: number) => dispatch({ type: "SMITE", personId }), []);
  const plague = useCallback((nationId: number) => dispatch({ type: "PLAGUE", nationId }), []);
  const fertilityBoom = useCallback(
    (nationId: number) => dispatch({ type: "FERTILITY_BOOM", nationId }),
    []
  );
  const terraform = useCallback(
    (kind: string, x: number, y: number) => dispatch({ type: "TERRAFORM", kind, x, y }),
    []
  );
  const convert = useCallback(
    (nationId: number, religion: string) => dispatch({ type: "CONVERT", nationId, religion }),
    []
  );
  const rainWealth = useCallback(
    (nationId: number, amount?: number) => dispatch({ type: "RAIN_WEALTH", nationId, amount }),
    []
  );
  const startWar = useCallback(
    (aId: number, bId: number) => dispatch({ type: "START_WAR", aId, bId }),
    []
  );
  const makePeace = useCallback(() => dispatch({ type: "MAKE_PEACE" }), []);
  const resurrect = useCallback((personId: number) => dispatch({ type: "RESURRECT", personId }), []);
  const advanceAge = useCallback(() => dispatch({ type: "ADVANCE_AGE" }), []);
  const spawnNation = useCallback((name: string) => dispatch({ type: "SPAWN_NATION", name }), []);
  const newWorld = useCallback(() => dispatch({ type: "NEW_WORLD" }), []);

  return {
    world: state.world,
    lastMessage: state.lastMessage,
    isRunning,
    setRunning: setIsRunning,
    advanceHours: advanceHoursAction,
    bless,
    smite,
    plague,
    fertilityBoom,
    terraform,
    convert,
    rainWealth,
    startWar,
    makePeace,
    resurrect,
    advanceAge,
    spawnNation,
    newWorld,
  };
}
