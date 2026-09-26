// lib/simulation/engine.ts
//
// Direct port of SimGod's simulation core (world generation, the needs/
// decide/act loop, nation economy, wars/holidays/sports, and the 12 god
// powers) into pure TypeScript functions.
//
// Mutation strategy: each exported entry point clones the incoming
// WorldState with `structuredClone` once, then mutates that private draft
// exactly the way the source script mutates its `World` dataclass in
// place — this keeps the control flow a near line-for-line match instead
// of turning every nested update into an immutable-update chain — and
// returns the finished draft. Nothing outside these functions ever sees or
// touches the draft mid-mutation, so from the caller's side (the
// useReducer-based hook in useSimulationEngine.ts) every call is a pure,
// referentially-fresh state transition, safe for React state.

import {
  AGES,
  BUILDING_KINDS,
  BUILDING_PICK_WEIGHTS,
  HOLIDAYS,
  JOBS,
  NAMES_F,
  NAMES_M,
  NAMES_X,
  NATION_COLORS,
  RELIGIONS,
  SEASONS,
  SPORTS,
  TRAITS,
  WEATHERS,
} from "./constants";
import type {
  Building,
  Nation,
  Person,
  Sex,
  WorldState,
} from "./types";

// --- small RNG helpers (source used Python's `random` module) -------------

const randInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const randFloat = (min: number, max: number) => Math.random() * (max - min) + min;

const choice = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

/** Sample k items without replacement (random.sample equivalent). */
function sample<T>(arr: readonly T[], k: number): T[] {
  const pool = [...arr];
  const n = Math.min(Math.max(0, k), pool.length);
  const result: T[] = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    result.push(pool.splice(idx, 1)[0]);
  }
  return result;
}

/** random.choices(items, weights=weights, k=1)[0] equivalent. */
function weightedChoice<T>(items: readonly T[], weights: readonly number[]): T {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

// --- logging & history ------------------------------------------------

function log(
  w: WorldState,
  kind: string,
  text: string,
  nationId: number | null = null,
  personId: number | null = null
) {
  w.events.push({ day: w.day, hour: w.hour, kind, text, nationId, personId });
  if (w.events.length > 800) w.events = w.events.slice(-800);
}

function recordHistory(w: WorldState) {
  const living = w.people.filter((p) => p.alive);
  const averageMood = living.length
    ? living.reduce((sum, p) => sum + p.mood, 0) / living.length
    : 0;
  w.history.push({
    day: w.day,
    population: living.length,
    averageMood: Math.round(averageMood * 10) / 10,
    buildings: w.buildings.length,
    nations: w.nations.length,
    age: AGES[w.ageIndex].name,
  });
  if (w.history.length > 500) w.history = w.history.slice(-500);
}

/** World.current_age(): finds the highest age the world now qualifies for
 * (by total living population and summed national tech) and logs a
 * transition event if it advanced. */
function currentAge(w: WorldState) {
  const pop = w.people.filter((p) => p.alive).length;
  const tech = w.nations.reduce((sum, n) => sum + n.tech, 0);
  let bestIdx = 0;
  AGES.forEach((age, i) => {
    if (pop >= age.minPopulation && tech >= age.minTech) bestIdx = i;
  });
  if (bestIdx > w.ageIndex) {
    w.ageIndex = bestIdx;
    log(w, "age", `The world enters the ${AGES[bestIdx].name}: ${AGES[bestIdx].description}`);
  }
  return AGES[w.ageIndex];
}

// --- world generation ---------------------------------------------------

function makePerson(
  w: WorldState,
  opts: { name?: string; nationId?: number | null; age?: number; sex?: Sex } = {}
): Person {
  const name = opts.name ?? choice(choice([NAMES_M, NAMES_F, NAMES_X]));
  const sex = opts.sex ?? choice(["M", "F"] as const);
  const age = opts.age ?? 0;

  const p: Person = {
    id: w.nextPersonId,
    name,
    age,
    sex,
    alive: true,
    energy: 80,
    hunger: 80,
    fun: 70,
    hygiene: 75,
    social: 65,
    mood: 70,
    traits: sample(TRAITS, randInt(2, 3)),
    job: "Child",
    wage: 0,
    wealth: 5,
    belief: { religion: null, devotion: 50, doubting: false },
    loyalty: randInt(30, 90),
    anger: 0,
    ambition: randInt(20, 90),
    relationships: {},
    partnerId: null,
    childrenIds: [],
    parentIds: [],
    x: 0,
    y: 0,
    nationId: opts.nationId ?? null,
    state: "idle",
    godLove: 50,
    godFear: 50,
  };

  if (age >= 14) {
    const options = JOBS.filter((j) => j.minAge <= age && j.title !== "Child");
    const job = choice(options);
    p.job = job.title;
    p.wage = job.wage;
  }

  w.people.push(p);
  w.nextPersonId += 1;
  return p;
}

function makeNation(w: WorldState, name: string, capital: [number, number]): Nation {
  const n: Nation = {
    id: w.nextNationId,
    name,
    color: NATION_COLORS[(w.nextNationId - 1) % NATION_COLORS.length],
    capital,
    faith: choice(RELIGIONS).name,
    culture: 0,
    military: 10,
    treasury: 100,
    tech: 0,
    stability: 70,
    atWarWith: [],
    holidays: [],
    foundedDay: w.day,
    motto: choice([
      "Rise.",
      "Endure.",
      "By the light.",
      "We remember.",
      "Strength and song.",
      "From ash, gold.",
      "The long road.",
    ]),
  };
  w.nations.push(n);
  w.nextNationId += 1;
  return n;
}

/**
 * World.seed_world(), minus the procedural terrain generation and
 * land-snapping pass (out of scope for this port — see the module header
 * in types.ts). People and buildings are seeded with plain [0,10]x[0,10]
 * coordinates instead of terrain-aware placement.
 */
export function seedWorld(): WorldState {
  const w: WorldState = {
    name: "Eden Prime",
    day: 1,
    hour: 8,
    weather: "Sunny",
    season: "Spring",
    ageIndex: 0,
    people: [],
    buildings: [],
    nations: [],
    events: [],
    nextPersonId: 1,
    nextBuildingId: 1,
    nextNationId: 1,
    miraclesPerformed: 0,
    smites: 0,
    births: 0,
    deaths: 0,
    warsFought: 0,
    history: [],
  };

  const n1 = makeNation(w, "Aurelia", [2.0, 2.0]);
  const n2 = makeNation(w, "Kaldor", [7.0, 5.0]);
  const n3 = makeNation(w, "Vessin", [4.5, 7.5]);

  const seedCitizens = (n: Nation, count: number) => {
    for (let i = 0; i < count; i++) {
      const p = makePerson(w, { nationId: n.id, age: randInt(16, 35) });
      p.x = n.capital[0] + randFloat(-0.8, 0.8);
      p.y = n.capital[1] + randFloat(-0.8, 0.8);
      p.belief.religion = n.faith;
    }
  };
  seedCitizens(n1, 6);
  seedCitizens(n2, 5);
  seedCitizens(n3, 4);

  for (const nation of w.nations) {
    for (const kind of ["House", "House", "Farm", "Market", "Temple"]) {
      w.buildings.push({
        id: w.nextBuildingId,
        name: `${kind} of ${nation.name}`,
        kind,
        x: nation.capital[0] + randFloat(-1, 1),
        y: nation.capital[1] + randFloat(-1, 1),
        nationId: nation.id,
        hp: 100,
        builtDay: 1,
      });
      w.nextBuildingId += 1;
    }
  }

  log(w, "system", "A world is born. Three nations breathe their first.");
  recordHistory(w);
  return w;
}

// --- per-person behavior: needs / decide / act -----------------------

function nearbyBuilding(w: WorldState, p: Person, kinds: readonly string[]): Building | null {
  let best: Building | null = null;
  let bestD = Infinity;
  for (const b of w.buildings) {
    if (!kinds.includes(b.kind) || b.hp <= 0) continue;
    const d = (b.x - p.x) ** 2 + (b.y - p.y) ** 2;
    if (d < bestD) {
      best = b;
      bestD = d;
    }
  }
  return best;
}

function wander(p: Person, toward?: [number, number], speed = 0.6) {
  if (!toward) {
    p.x += randFloat(-speed, speed);
    p.y += randFloat(-speed, speed);
  } else {
    const [tx, ty] = toward;
    p.x += (tx - p.x) * 0.25 + randFloat(-0.15, 0.15);
    p.y += (ty - p.y) * 0.25 + randFloat(-0.15, 0.15);
  }
  p.x = clamp(p.x, 0, 10);
  p.y = clamp(p.y, 0, 10);
}

function decayNeeds(p: Person, weather: WorldState["weather"]) {
  p.energy = Math.max(0, p.energy - randInt(1, 3));
  p.hunger = Math.max(0, p.hunger - randInt(2, 4));
  p.fun = Math.max(0, p.fun - randInt(1, 3));
  p.hygiene = Math.max(0, p.hygiene - randInt(1, 2));
  p.social = Math.max(0, p.social - randInt(1, 2));
  if (weather === "Stormy") p.mood = Math.max(0, p.mood - 1);
}

type Action = "eat" | "rest" | "clean" | "play" | "social" | "pray" | "work" | "idle";

function decide(p: Person): Action {
  const needs: Partial<Record<Action, number>> = {
    eat: 100 - p.hunger,
    rest: 100 - p.energy,
    clean: 100 - p.hygiene,
    play: 100 - p.fun,
    social: 100 - p.social,
  };
  if (p.traits.includes("lazy")) needs.rest = (needs.rest ?? 0) + 15;
  if (p.traits.includes("curious")) needs.play = (needs.play ?? 0) + 10;
  if (p.traits.includes("kind")) needs.social = (needs.social ?? 0) + 10;
  if (p.traits.includes("ambitious") && ["Merchant", "Politician", "Inventor"].includes(p.job)) {
    needs.work = 60;
  }
  if (p.traits.includes("pious")) needs.pray = 55;
  if (p.age < 14) needs.play = (needs.play ?? 0) + 20;

  let bestKey: Action = "idle";
  let bestValue = -Infinity;
  for (const [key, value] of Object.entries(needs) as [Action, number][]) {
    if (value > bestValue) {
      bestValue = value;
      bestKey = key;
    }
  }
  return bestKey;
}

function act(w: WorldState, p: Person, action: Action) {
  switch (action) {
    case "eat": {
      const b = nearbyBuilding(w, p, ["Farm", "Market", "Tavern"]);
      if (b) {
        wander(p, [b.x, b.y]);
        p.hunger = Math.min(100, p.hunger + 30);
        p.state = `eating at ${b.kind}`;
        if (b.kind === "Market" && p.wealth >= 3) p.wealth -= 3;
        return;
      }
      p.hunger = Math.min(100, p.hunger + 10);
      p.state = "foraging";
      return;
    }

    case "rest": {
      const b = nearbyBuilding(w, p, ["House"]);
      if (b) {
        wander(p, [b.x, b.y]);
        p.energy = Math.min(100, p.energy + 25);
        p.state = "resting at home";
        return;
      }
      p.energy = Math.min(100, p.energy + 8);
      p.state = "sleeping rough";
      return;
    }

    case "clean":
      p.hygiene = Math.min(100, p.hygiene + 25);
      p.state = "washing up";
      return;

    case "play": {
      const b = nearbyBuilding(w, p, ["Arena", "Theater", "Tavern"]);
      if (b) {
        wander(p, [b.x, b.y]);
        p.fun = Math.min(100, p.fun + 25);
        p.social = Math.min(100, p.social + 8);
        p.state = `enjoying the ${b.kind}`;
        return;
      }
      p.fun = Math.min(100, p.fun + 12);
      p.state = "playing";
      return;
    }

    case "social": {
      const others = w.people.filter(
        (q) => q.alive && q.id !== p.id && q.nationId === p.nationId
      );
      if (others.length) {
        let q = others[0];
        let bestD = Infinity;
        for (const o of others) {
          const d = (o.x - p.x) ** 2 + (o.y - p.y) ** 2;
          if (d < bestD) {
            bestD = d;
            q = o;
          }
        }
        wander(p, [q.x, q.y], 0.8);
        p.social = Math.min(100, p.social + 18);
        q.social = Math.min(100, q.social + 12);
        const affinity = clamp((p.relationships[q.id] ?? 0) + randInt(-2, 4), -100, 100);
        p.relationships[q.id] = affinity;
        q.relationships[p.id] = affinity;
        p.state = `talking with ${q.name}`;
        if (
          p.age >= 16 &&
          q.age >= 16 &&
          p.partnerId === null &&
          q.partnerId === null &&
          p.sex !== q.sex
        ) {
          if (affinity > 60 && Math.random() < 0.25) {
            p.partnerId = q.id;
            q.partnerId = p.id;
            log(w, "love", `${p.name} and ${q.name} became partners.`, p.nationId, p.id);
          }
        }
        return;
      }
      p.social = Math.min(100, p.social + 6);
      p.state = "alone";
      return;
    }

    case "pray": {
      const b = nearbyBuilding(w, p, ["Temple"]);
      if (b) {
        wander(p, [b.x, b.y]);
        p.belief.devotion = Math.min(100, p.belief.devotion + 8);
        p.mood = Math.min(100, p.mood + 6);
        p.state = "praying";
        if (Math.random() < p.godLove / 400) {
          p.mood = Math.min(100, p.mood + 10);
          log(w, "faith", `${p.name} felt a warmth from beyond.`, p.nationId, p.id);
        }
        return;
      }
      p.belief.devotion = Math.max(0, p.belief.devotion - 1);
      p.state = "whispering a prayer";
      return;
    }

    case "work": {
      const b = nearbyBuilding(w, p, Object.keys(BUILDING_KINDS));
      if (b) wander(p, [b.x, b.y]);
      else wander(p);
      p.wealth += p.wage;
      p.energy = Math.max(0, p.energy - 4);
      p.state = `working as ${p.job}`;
      return;
    }

    default:
      wander(p);
      p.state = "idle";
  }
}

function jobAssignment(p: Person) {
  if (!p.alive) return;
  if (p.age < 14) {
    p.job = "Child";
    p.wage = 0;
    return;
  }
  const options = JOBS.filter((j) => j.minAge <= p.age && j.title !== "Child");
  if (!options.length) return;
  const current = options.find((j) => j.title === p.job);
  if (current) {
    p.wage = current.wage;
    return;
  }
  const weights = options.map((job) => {
    let wt = 1.0;
    if (p.traits.includes("pious") && ["Priest", "Philosopher"].includes(job.title)) wt += 2;
    if (p.traits.includes("curious") && ["Scholar", "Scientist", "Inventor"].includes(job.title)) wt += 2;
    if (p.traits.includes("brave") && ["Soldier", "Hunter"].includes(job.title)) wt += 2;
    if (p.traits.includes("artistic") && ["Artist", "Philosopher"].includes(job.title)) wt += 2;
    if (p.traits.includes("greedy") && ["Merchant", "Politician"].includes(job.title)) wt += 2;
    if (p.traits.includes("ambitious") && job.wage >= 8) wt += 1;
    return wt;
  });
  const job = weightedChoice(options, weights);
  p.job = job.title;
  p.wage = job.wage;
}

function ageAndMortality(w: WorldState, p: Person) {
  if (w.hour !== 0) return;
  p.age += 1;
  if (p.age > 14 && p.job === "Child") jobAssignment(p);
  let deathChance = 0;
  if (p.age > 55) deathChance = (p.age - 55) * 0.004;
  if (p.hunger < 5 || p.energy < 5) deathChance += 0.15;
  if (p.mood < 10) deathChance += 0.02;
  if (Math.random() < deathChance) {
    p.alive = false;
    p.state = "passed away";
    w.deaths += 1;
    log(w, "death", `${p.name} died at age ${p.age}.`, p.nationId, p.id);
  }
}

// --- world-level systems (all hour === 0 gated, same as the source) -----

function births(w: WorldState) {
  if (w.hour !== 0) return;
  const mothers = w.people.filter((x) => x.alive && x.partnerId !== null && x.sex === "F");
  for (const p of mothers) {
    const partner = w.people.find((q) => q.id === p.partnerId && q.alive);
    if (!partner) continue;
    if (p.age >= 16 && p.age <= 45 && Math.random() < 0.18 && p.hunger > 40 && p.energy > 40) {
      const child = makePerson(w, { nationId: p.nationId, age: 0, sex: choice(["M", "F"] as const) });
      child.x = p.x + randFloat(-0.3, 0.3);
      child.y = p.y + randFloat(-0.3, 0.3);
      child.parentIds = [p.id, partner.id];
      child.belief.religion = p.belief.religion ?? partner.belief.religion;
      child.belief.devotion = Math.max(20, Math.floor((p.belief.devotion + partner.belief.devotion) / 2));
      p.childrenIds.push(child.id);
      partner.childrenIds.push(child.id);
      p.mood = Math.min(100, p.mood + 12);
      partner.mood = Math.min(100, partner.mood + 12);
      w.births += 1;
      log(w, "birth", `${child.name} was born to ${p.name} and ${partner.name}.`, p.nationId, child.id);
    }
  }
}

function maybeWar(w: WorldState) {
  if (w.hour !== 0) return;
  for (const n of [...w.nations]) {
    if (n.atWarWith.length) {
      const enemyId = choice(n.atWarWith);
      const enemy = w.nations.find((x) => x.id === enemyId);
      if (!enemy) {
        n.atWarWith = n.atWarWith.filter((e) => e !== enemyId);
        continue;
      }
      const soldiers = w.people.filter((p) => p.alive && p.nationId === n.id && p.job === "Soldier");
      const enemySoldiers = w.people.filter(
        (p) => p.alive && p.nationId === enemy.id && p.job === "Soldier"
      );
      for (const s of sample(soldiers, randInt(0, 2))) {
        if (Math.random() < 0.4) {
          s.alive = false;
          w.deaths += 1;
          log(w, "war", `${s.name} fell in battle for ${n.name}.`, n.id, s.id);
        }
      }
      for (const s of sample(enemySoldiers, randInt(0, 2))) {
        if (Math.random() < 0.4) {
          s.alive = false;
          w.deaths += 1;
          log(w, "war", `${s.name} fell in battle for ${enemy.name}.`, enemy.id, s.id);
        }
      }
      n.stability = Math.max(0, n.stability - 2);
      enemy.stability = Math.max(0, enemy.stability - 2);
      if (Math.random() < 0.08) {
        n.atWarWith = n.atWarWith.filter((e) => e !== enemyId);
        enemy.atWarWith = enemy.atWarWith.filter((e) => e !== n.id);
        log(w, "peace", `${n.name} and ${enemy.name} made peace.`);
      }
    } else if (n.military > 25 && n.stability > 40 && Math.random() < 0.03) {
      const others = w.nations.filter((x) => x.id !== n.id);
      if (others.length) {
        const target = choice(others);
        n.atWarWith.push(target.id);
        target.atWarWith.push(n.id);
        w.warsFought += 1;
        log(w, "war", `${n.name} declared war on ${target.name}!`);
      }
    }
  }
}

function maybeHoliday(w: WorldState) {
  if (w.hour !== 0 || Math.random() > 0.04) return;
  for (const n of w.nations) {
    if (n.holidays.length < 6 && Math.random() < 0.3) {
      const h = choice(HOLIDAYS);
      if (!n.holidays.includes(h)) {
        n.holidays.push(h);
        log(w, "holiday", `${n.name} now celebrates ${h}.`, n.id);
        for (const p of w.people) {
          if (p.alive && p.nationId === n.id) {
            p.mood = Math.min(100, p.mood + 12);
            p.fun = Math.min(100, p.fun + 10);
          }
        }
      }
    }
  }
}

function maybeSport(w: WorldState) {
  if (w.hour !== 0 || Math.random() > 0.06) return;
  if (!w.nations.length) return;
  const n = choice(w.nations);
  const sport = choice(SPORTS);
  const athletes = w.people.filter(
    (p) => p.alive && p.nationId === n.id && (p.job === "Athlete" || Math.random() < 0.15)
  );
  if (athletes.length < 2) return;
  const winner = choice(athletes);
  for (const p of athletes) {
    p.fun = Math.min(100, p.fun + 8);
    p.mood = Math.min(100, p.mood + 5);
  }
  winner.mood = Math.min(100, winner.mood + 15);
  winner.wealth += 10;
  log(w, "sport", `${winner.name} won ${sport} for ${n.name}!`, n.id, winner.id);
}

function nationTick(w: WorldState) {
  if (w.hour !== 0) return;
  for (const n of w.nations) {
    const citizens = w.people.filter((p) => p.alive && p.nationId === n.id);
    const pop = citizens.length;
    if (pop === 0) {
      n.stability = Math.max(0, n.stability - 5);
      continue;
    }

    const income = Math.floor(citizens.reduce((sum, p) => sum + p.wage, 0) / 4);
    n.treasury += income;

    const scholars = citizens.filter((p) =>
      ["Scholar", "Scientist", "Inventor", "Engineer"].includes(p.job)
    ).length;
    const artists = citizens.filter((p) => ["Artist", "Philosopher", "Teacher"].includes(p.job)).length;
    const soldiers = citizens.filter((p) => ["Soldier", "Hunter"].includes(p.job)).length;
    n.tech += 1 + scholars;
    n.culture += artists;
    n.military = Math.max(0, n.military + Math.floor(soldiers / 2) - 1);

    const avgMood = citizens.reduce((sum, p) => sum + p.mood, 0) / pop;
    if (avgMood > 70) n.stability = Math.min(100, n.stability + 1);
    else if (avgMood < 35) n.stability = Math.max(0, n.stability - 2);
    if (n.atWarWith.length) n.stability = Math.max(0, n.stability - 1);

    const faiths: Record<string, number> = {};
    for (const p of citizens) {
      if (p.belief.religion) faiths[p.belief.religion] = (faiths[p.belief.religion] ?? 0) + 1;
    }
    const faithEntries = Object.entries(faiths);
    if (faithEntries.length) {
      const [dominant, count] = faithEntries.reduce((best, cur) => (cur[1] > best[1] ? cur : best));
      if (dominant !== n.faith && count / pop > 0.6) {
        const old = n.faith;
        n.faith = dominant;
        log(w, "faith", `${n.name} has converted from ${old} to ${dominant}.`, n.id);
      }
    }

    if (n.treasury >= 60 && Math.random() < 0.25) {
      const kinds = Object.keys(BUILDING_KINDS);
      const kind = weightedChoice(kinds, BUILDING_PICK_WEIGHTS);
      const cost = BUILDING_KINDS[kind].cost;
      if (n.treasury >= cost) {
        n.treasury -= cost;
        const count = w.buildings.filter((b) => b.nationId === n.id).length + 1;
        w.buildings.push({
          id: w.nextBuildingId,
          name: `${kind} ${count} of ${n.name}`,
          kind,
          x: n.capital[0] + randFloat(-1.5, 1.5),
          y: n.capital[1] + randFloat(-1.5, 1.5),
          nationId: n.id,
          hp: 100,
          builtDay: w.day,
        });
        w.nextBuildingId += 1;
        log(w, "build", `${n.name} raised a ${kind}.`, n.id);
      }
    }

    if (n.stability <= 0 && pop < 3) {
      log(w, "collapse", `${n.name} has fallen into ruin.`, n.id);
    }
  }
}

// --- main tick -----------------------------------------------------------

function tickOnce(w: WorldState) {
  w.hour += 1;
  if (w.hour >= 24) {
    w.hour = 0;
    w.day += 1;
    if (w.day % 24 === 1) {
      const idx = (SEASONS.indexOf(w.season) + 1) % SEASONS.length;
      w.season = SEASONS[idx];
      log(w, "season", `The season turns to ${w.season}.`);
    }
    w.weather = choice(WEATHERS);
    currentAge(w);
  }

  const living = w.people.filter((p) => p.alive);
  for (const p of living) {
    if (!p.alive) continue;
    decayNeeds(p, w.weather);
    const action = decide(p);
    act(w, p, action);

    if (p.mood < 40 && Math.random() < 0.3) p.mood = Math.max(0, p.mood - 1);
    else if (p.mood > 60) p.mood = Math.min(100, p.mood + 1);

    if (p.hunger < 20 || p.energy < 20) p.anger = Math.min(100, p.anger + 1);
    else p.anger = Math.max(0, p.anger - 1);

    if (p.hunger <= 0 || p.energy <= 0) {
      p.alive = false;
      p.state = "collapsed";
      w.deaths += 1;
      log(w, "death", `${p.name} collapsed from deprivation.`, p.nationId, p.id);
    }

    ageAndMortality(w, p);
  }

  births(w);
  nationTick(w);
  maybeWar(w);
  maybeHoliday(w);
  maybeSport(w);

  for (const p of w.people) {
    if (p.alive && p.partnerId !== null) {
      const partner = w.people.find((q) => q.id === p.partnerId);
      if (!partner || !partner.alive) p.partnerId = null;
    }
  }

  if (w.weather === "Stormy" || w.weather === "Snowy") {
    for (const p of w.people) {
      if (p.alive && Math.random() < 0.05) p.mood = Math.max(0, p.mood - 1);
    }
  }

  if (w.hour === 0) recordHistory(w);
}

/** tick(w, hours) from the source, minus the Streamlit progress callback. */
export function advanceHours(state: WorldState, hours: number): WorldState {
  const draft = structuredClone(state);
  for (let i = 0; i < hours; i++) tickOnce(draft);
  return draft;
}

// --- god powers -----------------------------------------------------------
// Each mirrors one god_* function from the source. Rather than mutating a
// shared World in place and returning a status string, each takes the
// current WorldState and returns a fresh { world, message } pair — message
// is the same user-facing text the source passed to st.success/.error/etc.

export interface GodPowerResult {
  world: WorldState;
  message: string;
}

export function godBless(state: WorldState, personId: number, amount = 40): GodPowerResult {
  const w = structuredClone(state);
  const p = w.people.find((x) => x.id === personId);
  if (!p || !p.alive) return { world: w, message: "That soul cannot be found." };
  p.mood = Math.min(100, p.mood + amount);
  p.energy = Math.min(100, p.energy + amount);
  p.hunger = Math.min(100, p.hunger + amount);
  p.fun = Math.min(100, p.fun + amount);
  p.hygiene = Math.min(100, p.hygiene + amount);
  p.social = Math.min(100, p.social + amount);
  p.godLove = Math.min(100, p.godLove + 15);
  p.state = "touched by the divine";
  w.miraclesPerformed += 1;
  log(w, "miracle", `A blessing fell upon ${p.name}.`, p.nationId, p.id);
  return { world: w, message: `${p.name} is bathed in light.` };
}

export function godSmite(state: WorldState, personId: number): GodPowerResult {
  const w = structuredClone(state);
  const p = w.people.find((x) => x.id === personId);
  if (!p || !p.alive) return { world: w, message: "That soul cannot be found." };
  p.alive = false;
  p.state = "struck down";
  w.deaths += 1;
  w.smites += 1;
  log(w, "smite", `${p.name} was struck down by divine wrath.`, p.nationId, p.id);
  if (p.nationId !== null) {
    for (const q of w.people) {
      if (q.alive && q.nationId === p.nationId) q.godFear = Math.min(100, q.godFear + 20);
    }
  }
  return { world: w, message: `${p.name} has been smitten.` };
}

export function godPlague(state: WorldState, nationId: number): GodPowerResult {
  const w = structuredClone(state);
  const n = w.nations.find((x) => x.id === nationId);
  if (!n) return { world: w, message: "No such nation." };
  let killed = 0;
  for (const p of w.people.filter((x) => x.alive && x.nationId === nationId)) {
    if (Math.random() < 0.35) {
      p.hunger = Math.max(0, p.hunger - 40);
      p.energy = Math.max(0, p.energy - 40);
      p.mood = Math.max(0, p.mood - 30);
      p.godFear = Math.min(100, p.godFear + 30);
      if (p.hunger <= 0 || p.energy <= 0) {
        p.alive = false;
        p.state = "claimed by plague";
        killed += 1;
        w.deaths += 1;
      }
    }
  }
  w.smites += 1;
  log(w, "plague", `A plague swept through ${n.name}. ${killed} perished.`, n.id);
  return { world: w, message: `Plague visited ${n.name}. ${killed} souls lost.` };
}

export function godFertilityBoom(state: WorldState, nationId: number): GodPowerResult {
  const w = structuredClone(state);
  const n = w.nations.find((x) => x.id === nationId);
  if (!n) return { world: w, message: "No such nation." };
  for (let i = 0; i < 5; i++) {
    const child = makePerson(w, { nationId: n.id, age: 0 });
    child.x = n.capital[0] + randFloat(-1, 1);
    child.y = n.capital[1] + randFloat(-1, 1);
  }
  w.miraclesPerformed += 1;
  log(w, "miracle", `Five new souls bloomed in ${n.name}.`, n.id);
  return { world: w, message: `Fertility blesses ${n.name}. Five children born.` };
}

export function godTerraform(state: WorldState, kind: string, x: number, y: number): GodPowerResult {
  const w = structuredClone(state);
  w.buildings.push({
    id: w.nextBuildingId,
    name: `${kind} of the God`,
    kind,
    x,
    y,
    nationId: null,
    hp: 100,
    builtDay: w.day,
  });
  w.nextBuildingId += 1;
  w.miraclesPerformed += 1;
  log(w, "miracle", `A ${kind} materialized from nothing at (${x.toFixed(1)}, ${y.toFixed(1)}).`);
  return { world: w, message: `A ${kind} appeared.` };
}

export function godConvert(state: WorldState, nationId: number, religion: string): GodPowerResult {
  const w = structuredClone(state);
  const n = w.nations.find((x) => x.id === nationId);
  if (!n) return { world: w, message: "No such nation." };
  n.faith = religion;
  for (const p of w.people) {
    if (p.alive && p.nationId === nationId) {
      p.belief.religion = religion;
      p.belief.devotion = Math.min(100, p.belief.devotion + 20);
      p.godLove = Math.min(100, p.godLove + 10);
    }
  }
  w.miraclesPerformed += 1;
  log(w, "faith", `${n.name} was converted to ${religion} by divine will.`, n.id);
  return { world: w, message: `${n.name} now follows ${religion}.` };
}

export function godMakePeace(state: WorldState): GodPowerResult {
  const w = structuredClone(state);
  for (const n of w.nations) n.atWarWith = [];
  log(w, "peace", "A great silence falls over the battlefields.");
  return { world: w, message: "All wars have ended." };
}

export function godStartWar(state: WorldState, aId: number, bId: number): GodPowerResult {
  const w = structuredClone(state);
  const a = w.nations.find((x) => x.id === aId);
  const b = w.nations.find((x) => x.id === bId);
  if (!a || !b || a === b) return { world: w, message: "Invalid pairing." };
  if (!a.atWarWith.includes(b.id)) a.atWarWith.push(b.id);
  if (!b.atWarWith.includes(a.id)) b.atWarWith.push(a.id);
  w.warsFought += 1;
  log(w, "war", `By divine decree, ${a.name} and ${b.name} are at war.`);
  return { world: w, message: `${a.name} vs ${b.name}` };
}

export function godResurrect(state: WorldState, personId: number): GodPowerResult {
  const w = structuredClone(state);
  const p = w.people.find((x) => x.id === personId);
  if (!p) return { world: w, message: "That soul is beyond reach." };
  p.alive = true;
  p.energy = 80;
  p.hunger = 80;
  p.mood = 70;
  p.fun = 70;
  p.state = "returned from death";
  w.miraclesPerformed += 1;
  log(w, "miracle", `${p.name} rose again.`, p.nationId, p.id);
  return { world: w, message: `${p.name} breathes once more.` };
}

export function godRainWealth(state: WorldState, nationId: number, amount = 500): GodPowerResult {
  const w = structuredClone(state);
  const n = w.nations.find((x) => x.id === nationId);
  if (!n) return { world: w, message: "No such nation." };
  n.treasury += amount;
  w.miraclesPerformed += 1;
  log(w, "miracle", `Gold rained on ${n.name}.`, n.id);
  return { world: w, message: `${n.name} received ${amount} gold.` };
}

export function godAdvanceAge(state: WorldState): GodPowerResult {
  const w = structuredClone(state);
  w.ageIndex = Math.min(AGES.length - 1, w.ageIndex + 1);
  const age = AGES[w.ageIndex];
  log(w, "age", `By divine hand, the world leaps into the ${age.name}.`);
  return { world: w, message: `The ${age.name} begins: ${age.description}` };
}

export function godSpawnNation(state: WorldState, name: string): GodPowerResult {
  const w = structuredClone(state);
  const cap: [number, number] = [randFloat(1, 9), randFloat(1, 9)];
  const n = makeNation(w, name, cap);
  for (let i = 0; i < 4; i++) {
    const p = makePerson(w, { nationId: n.id, age: randInt(16, 35) });
    p.x = cap[0] + randFloat(-0.8, 0.8);
    p.y = cap[1] + randFloat(-0.8, 0.8);
    p.belief.religion = n.faith;
  }
  for (const kind of ["House", "House", "Farm"]) {
    w.buildings.push({
      id: w.nextBuildingId,
      name: `${kind} of ${n.name}`,
      kind,
      x: cap[0] + randFloat(-1, 1),
      y: cap[1] + randFloat(-1, 1),
      nationId: n.id,
      hp: 100,
      builtDay: w.day,
    });
    w.nextBuildingId += 1;
  }
  w.miraclesPerformed += 1;
  log(w, "miracle", `A new nation, ${name}, rises from the earth.`);
  return { world: w, message: `${name} has been founded at (${cap[0].toFixed(1)}, ${cap[1].toFixed(1)}).` };
}
