"use client";

// app/page.tsx
//
// GodSim live dashboard — driven entirely by lib/simulationEngine.ts
// (Cosmic Ages / Tech Eras / XP-leveling citizen engine), using nothing but
// native React hooks (no Zustand here; see useSimulationEngine()).
//
// 3-column layout:
//   Left   — scrollable inhabitant list (level gauge, job badge, needs %) with
//            a click-to-open inspector modal (wealth + traits).
//   Middle — active Cosmic Age card (narrative) + a live scrolling event log.
//   Right  — commodity exchange board (treasury, price, scarcity badge) per
//            nation, plus the "Divine Interventions" toolbox.
//
// The outer shell reads the active Cosmic Age's `colorTheme` and applies the
// matching COSMIC_AGE_THEME gradient with a Tailwind transition, so the whole
// page's mood shifts smoothly as ages turn over.

import { useMemo, useState } from "react";
import {
  Sparkles,
  Play,
  Pause,
  Clock,
  Users,
  Wheat,
  Landmark,
  Swords,
  Wand2,
  UserPlus,
  Star,
  ScrollText,
  X,
  Gem,
  Coins,
} from "lucide-react";
import {
  useSimulationEngine,
  getCosmicAge,
  COSMIC_AGE_THEME,
  TECH_ERAS,
  type Person,
  type Nation,
  type EventLog,
  type JobClass,
} from "@/lib/simulationEngine";

const JOB_BADGE: Record<JobClass, string> = {
  Farmer: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  Scholar: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  Merchant: "border-amber-500/40 bg-amber-500/10 text-amber-300",
};

const EVENT_KIND_COLOR: Record<EventLog["kind"], string> = {
  death: "text-red-400",
  levelup: "text-sky-300",
  war: "text-rose-400",
  miracle: "text-fuchsia-300",
  birth: "text-emerald-300",
  system: "text-slate-400",
};

export default function Page() {
  const {
    world,
    isRunning,
    setRunning,
    spawnCitizenAction,
    castBlessingAction,
  } = useSimulationEngine();

  const cosmicAge = useMemo(() => getCosmicAge(world.day), [world.day]);
  const [inspectedPersonId, setInspectedPersonId] = useState<number | null>(null);

  const inspectedPerson = useMemo(
    () => world.people.find((p) => p.id === inspectedPersonId) ?? null,
    [world.people, inspectedPersonId]
  );

  const livingPopulation = world.people.filter((p) => p.alive).length;
  const techEra = TECH_ERAS[world.techEraIndex];

  return (
    <div
      className={`min-h-screen bg-gradient-to-b ${COSMIC_AGE_THEME[cosmicAge.colorTheme]} text-slate-100 transition-colors duration-1000`}
    >
      <HeaderBar
        day={world.day}
        techEraName={techEra.name}
        isRunning={isRunning}
        onToggleRunning={() => setRunning(!isRunning)}
      />

      <main className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-[320px_1fr_360px]">
        <LeftColumn people={world.people} onInspect={setInspectedPersonId} />
        <MiddleColumn
          cosmicAge={cosmicAge}
          day={world.day}
          livingPopulation={livingPopulation}
          eventLog={world.eventLog}
        />
        <RightColumn
          nations={world.nations}
          onSpawnCitizen={spawnCitizenAction}
          onCastBlessing={castBlessingAction}
        />
      </main>

      {inspectedPerson && (
        <PersonInspectorModal
          person={inspectedPerson}
          onClose={() => setInspectedPersonId(null)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */

function HeaderBar({
  day,
  techEraName,
  isRunning,
  onToggleRunning,
}: {
  day: number;
  techEraName: string;
  isRunning: boolean;
  onToggleRunning: () => void;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-slate-950/50 px-4 py-3 backdrop-blur">
      <div className="flex items-center gap-2">
        <span className="text-lg font-bold tracking-tight text-slate-50">
          GodSim
        </span>
        <span className="rounded bg-white/10 px-2 py-0.5 text-xs text-slate-300">
          {techEraName}
        </span>
      </div>

      <div className="flex items-center gap-4 text-sm">
        <StatPill icon={Clock} label="Day" value={day.toLocaleString()} />

        <button
          onClick={onToggleRunning}
          className="flex items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/10"
        >
          {isRunning ? <Pause size={14} /> : <Play size={14} />}
          {isRunning ? "Pause" : "Resume"}
        </button>
      </div>
    </header>
  );
}

function StatPill({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-1.5">
      <Icon size={14} className="text-slate-400" />
      <span className="text-slate-400">{label}</span>
      <span className="font-mono font-semibold text-slate-100">{value}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Left column: scrollable inhabitant list                             */
/* ------------------------------------------------------------------ */

function LeftColumn({
  people,
  onInspect,
}: {
  people: Person[];
  onInspect: (id: number) => void;
}) {
  return (
    <section className="flex max-h-[calc(100vh-6rem)] flex-col rounded-lg border border-white/10 bg-slate-950/40">
      <h2 className="border-b border-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
        Inhabitants ({people.filter((p) => p.alive).length})
      </h2>
      <ul className="flex-1 divide-y divide-white/5 overflow-y-auto">
        {people.map((p) => (
          <li key={p.id}>
            <button
              onClick={() => onInspect(p.id)}
              disabled={!p.alive}
              className={`flex w-full flex-col gap-1.5 px-3 py-2 text-left transition-colors ${
                p.alive
                  ? "hover:bg-white/5"
                  : "cursor-not-allowed opacity-40"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-slate-100">
                  {p.name}
                  {!p.alive && (
                    <span className="ml-1.5 text-[10px] text-slate-500">
                      (deceased)
                    </span>
                  )}
                </span>
                <span
                  className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${JOB_BADGE[p.job]}`}
                >
                  {p.job}
                </span>
              </div>

              <LevelGauge level={p.level} xp={p.xp} />
              <NeedsBars hunger={p.hunger} energy={p.energy} mood={p.mood} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function LevelGauge({ level, xp }: { level: number; xp: number }) {
  const threshold = level * 100;
  const pct = threshold > 0 ? Math.min(100, Math.round((xp / threshold) * 100)) : 0;
  return (
    <div className="flex items-center gap-1.5">
      <span className="shrink-0 text-[10px] font-semibold text-fuchsia-300">
        Lv.{level}
      </span>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-fuchsia-400/80"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function NeedsBars({
  hunger,
  energy,
  mood,
}: {
  hunger: number;
  energy: number;
  mood: number;
}) {
  return (
    <div className="flex gap-2 text-[9px] text-slate-400">
      <span>
        Hunger <span className="font-mono text-slate-200">{Math.round(hunger)}%</span>
      </span>
      <span>
        Energy <span className="font-mono text-slate-200">{Math.round(energy)}%</span>
      </span>
      <span>
        Mood <span className="font-mono text-slate-200">{Math.round(mood)}%</span>
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Person inspector modal (wealth + traits)                            */
/* ------------------------------------------------------------------ */

function PersonInspectorModal({
  person,
  onClose,
}: {
  person: Person;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-lg border border-white/15 bg-slate-900 p-4 shadow-xl"
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-50">{person.name}</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200"
          >
            <X size={16} />
          </button>
        </div>

        <dl className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <dt className="text-slate-500">Age</dt>
            <dd className="font-mono text-slate-200">{person.age}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Job</dt>
            <dd className="font-mono text-slate-200">{person.job}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Level</dt>
            <dd className="font-mono text-slate-200">{person.level}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Wealth</dt>
            <dd className="flex items-center gap-1 font-mono text-amber-300">
              <Coins size={12} /> {Math.round(person.wealth)}
            </dd>
          </div>
        </dl>

        <div className="mt-3">
          <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Traits
          </h4>
          {person.traits.length === 0 ? (
            <p className="text-xs text-slate-500">No traits discovered yet.</p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {person.traits.map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-fuchsia-500/40 bg-fuchsia-500/10 px-2 py-0.5 text-[10px] text-fuchsia-300"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Middle column: active Cosmic Age card + scrolling event log         */
/* ------------------------------------------------------------------ */

function MiddleColumn({
  cosmicAge,
  day,
  livingPopulation,
  eventLog,
}: {
  cosmicAge: ReturnType<typeof getCosmicAge>;
  day: number;
  livingPopulation: number;
  eventLog: EventLog[];
}) {
  const recentEvents = useMemo(() => eventLog.slice(-60).reverse(), [eventLog]);

  return (
    <section className="flex flex-col gap-4">
      <div className="rounded-lg border border-white/10 bg-white/5 p-4">
        <div className="mb-1 flex items-center gap-2">
          <Sparkles size={16} className="text-slate-200" />
          <h2 className="text-base font-bold text-slate-50">{cosmicAge.name}</h2>
        </div>
        <p className="text-sm leading-relaxed text-slate-300">
          {cosmicAge.description}
        </p>
        <div className="mt-3 flex items-center gap-3 text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <Clock size={12} /> Day {day}
          </span>
          <span className="flex items-center gap-1">
            <Users size={12} /> {livingPopulation} living
          </span>
        </div>
      </div>

      <div className="flex max-h-[calc(100vh-16rem)] flex-1 flex-col rounded-lg border border-white/10 bg-slate-950/40">
        <h3 className="flex items-center gap-1.5 border-b border-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
          <ScrollText size={13} /> Event Log
        </h3>
        <ul className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {recentEvents.length === 0 ? (
            <li className="text-xs text-slate-500">Nothing has happened yet.</li>
          ) : (
            recentEvents.map((e, i) => (
              <li key={`${e.day}-${i}`} className="text-xs leading-relaxed">
                <span className="mr-1.5 font-mono text-slate-600">
                  D{e.day}
                </span>
                <span className={EVENT_KIND_COLOR[e.kind]}>{e.text}</span>
              </li>
            ))
          )}
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Right column: commodity exchange board + Divine Interventions       */
/* ------------------------------------------------------------------ */

function RightColumn({
  nations,
  onSpawnCitizen,
  onCastBlessing,
}: {
  nations: Nation[];
  onSpawnCitizen: () => void;
  onCastBlessing: () => void;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="rounded-lg border border-white/10 bg-slate-950/40">
        <h2 className="border-b border-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
          Commodity Exchange
        </h2>
        <ul className="divide-y divide-white/5">
          {nations.map((n) => (
            <li key={n.id} className="p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-100">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: n.color }}
                  />
                  {n.name}
                  {n.atWarWith.length > 0 && (
                    <Swords size={12} className="text-rose-400" />
                  )}
                </span>
                <span className="flex items-center gap-1 font-mono text-xs text-amber-300">
                  <Landmark size={12} /> {Math.round(n.treasury).toLocaleString()} gp
                </span>
              </div>

              {n.market.map((g) => (
                <div
                  key={g.name}
                  className="flex items-center justify-between rounded bg-white/5 px-2 py-1.5 text-xs"
                >
                  <span className="flex items-center gap-1.5 text-slate-300">
                    <Wheat size={12} className="text-emerald-400" />
                    {g.name}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-mono tabular-nums text-slate-100">
                      {g.price.toFixed(2)} gp
                    </span>
                    <PriceDelta delta={g.delta} />
                    <ScarcityBadge supply={g.supply} demand={g.demand} />
                  </span>
                </div>
              ))}

              <div className="mt-1.5 text-[10px] text-slate-500">
                Tech {Math.round(n.technology)}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-lg border border-fuchsia-500/30 bg-slate-950/60 p-3">
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-fuchsia-300">
          <Wand2 size={13} /> Divine Interventions
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onSpawnCitizen}
            className="flex items-center justify-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20"
          >
            <UserPlus size={13} /> Spawn Citizen
          </button>
          <button
            onClick={onCastBlessing}
            className="flex items-center justify-center gap-1.5 rounded-md border border-fuchsia-500/30 bg-fuchsia-500/10 px-3 py-2 text-xs font-semibold text-fuchsia-300 hover:bg-fuchsia-500/20"
          >
            <Star size={13} /> Cast Blessing
          </button>
        </div>
      </div>
    </section>
  );
}

function PriceDelta({ delta }: { delta: number }) {
  if (delta > 0) {
    return <span className="font-mono text-[10px] text-emerald-400">+{delta.toFixed(2)}</span>;
  }
  if (delta < 0) {
    return <span className="font-mono text-[10px] text-red-400">{delta.toFixed(2)}</span>;
  }
  return <span className="font-mono text-[10px] text-slate-500">0.00</span>;
}

function ScarcityBadge({ supply, demand }: { supply: number; demand: number }) {
  if (supply >= demand * 1.2) {
    return (
      <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-400">
        Abundant
      </span>
    );
  }
  if (supply < demand) {
    return (
      <span className="rounded-full bg-red-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-red-400">
        <Gem size={9} className="inline -mt-0.5" /> Scarce
      </span>
    );
  }
  return (
    <span className="rounded-full bg-slate-700/60 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
      Stable
    </span>
  );
}
