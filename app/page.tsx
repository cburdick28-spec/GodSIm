"use client";

// app/page.tsx
//
// GodSim live dashboard — driven entirely by lib/simulationEngine.ts.
// Native React hooks only (no Zustand): useSimulationEngine() is a
// useReducer + useEffect hook, and mode/selection here are plain useState.
//
// 3-column layout:
//   Left   — scrollable inhabitant list (level gauge, job badge, needs %)
//            with a click-to-open inspector modal (wealth + traits; God
//            Mode adds per-citizen trait injection buttons there).
//   Middle — active Cosmic Age card (narrative), an active-crises strip,
//            and a live scrolling event log.
//   Right  — commodity exchange board (treasury, price, delta, scarcity
//            badge, military might) per nation, plus a Nation Control
//            Panel that swaps between Ruler Mode legislation and the God
//            Mode Divine Intervention Toolkit depending on the header's
//            mode toggle.

import { useEffect, useMemo, useState } from "react";
import {
  Sparkles,
  Play,
  Pause,
  Clock,
  Users,
  Wheat,
  Gem,
  Landmark,
  Swords,
  Wand2,
  Crown,
  UserPlus,
  Star,
  ScrollText,
  X,
  Coins,
  ChevronUp,
  ChevronDown,
  Minus,
  AlertTriangle,
  HeartPulse,
  Biohazard,
  ShieldPlus,
} from "lucide-react";
import {
  useSimulationEngine,
  getCosmicAge,
  COSMIC_AGE_THEME,
  TECH_ERAS,
  CRISIS_LABEL,
  DIVINE_BLESSING_TRAIT,
  BUBONIC_PLAGUE_TRAIT,
  type Person,
  type Nation,
  type EventLog,
  type JobClass,
  type GoodName,
  type Law,
  type LawId,
} from "@/lib/simulationEngine";

const JOB_BADGE: Record<JobClass, string> = {
  Farmer: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  Scholar: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  Merchant: "border-amber-500/40 bg-amber-500/10 text-amber-300",
};

const GOOD_ICON: Record<GoodName, typeof Wheat> = {
  Food: Wheat,
  Luxury: Gem,
};

const EVENT_KIND_COLOR: Record<EventLog["kind"], string> = {
  death: "text-red-400",
  levelup: "text-sky-300",
  war: "text-rose-400",
  miracle: "text-fuchsia-300",
  birth: "text-emerald-300",
  system: "text-slate-400",
  crisis: "text-orange-300",
  law: "text-amber-300",
};

const POPULATION_QUICK_STEP = 10_000;
const TREASURY_SPAWN_AMOUNT = 5_000;

type Mode = "ruler" | "god";

export default function Page() {
  const {
    world,
    isRunning,
    setRunning,
    spawnCitizenAction,
    castBlessingAction,
    setPopulationAction,
    adjustPopulationAction,
    addTreasuryAction,
    togglePersonTraitAction,
    toggleLawAction,
  } = useSimulationEngine();

  const [mode, setMode] = useState<Mode>("ruler");
  const [selectedNationId, setSelectedNationId] = useState<number>(world.nations[0]?.id ?? 1);
  const [inspectedPersonId, setInspectedPersonId] = useState<number | null>(null);

  const cosmicAge = useMemo(() => getCosmicAge(world.day), [world.day]);

  const selectedNation = useMemo(
    () => world.nations.find((n) => n.id === selectedNationId) ?? world.nations[0],
    [world.nations, selectedNationId]
  );

  const inspectedPerson = useMemo(
    () => world.people.find((p) => p.id === inspectedPersonId) ?? null,
    [world.people, inspectedPersonId]
  );

  const livingPopulation = world.people.filter((p) => p.alive).length;
  const totalPopulation = world.nations.reduce((sum, n) => sum + n.population, 0);
  const techEra = TECH_ERAS[world.techEraIndex];

  const activeCrises = useMemo(
    () => world.nations.filter((n) => n.activeCrisis !== null),
    [world.nations]
  );

  return (
    <div
      className={`min-h-screen bg-gradient-to-b ${COSMIC_AGE_THEME[cosmicAge.colorTheme]} text-slate-100 transition-colors duration-1000`}
    >
      <HeaderBar
        day={world.day}
        techEraName={techEra.name}
        totalPopulation={totalPopulation}
        isRunning={isRunning}
        mode={mode}
        onToggleRunning={() => setRunning(!isRunning)}
        onToggleMode={() => setMode((m) => (m === "ruler" ? "god" : "ruler"))}
      />

      <main className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-[320px_1fr_400px]">
        <LeftColumn people={world.people} onInspect={setInspectedPersonId} />

        <MiddleColumn
          cosmicAge={cosmicAge}
          day={world.day}
          livingPopulation={livingPopulation}
          activeCrises={activeCrises}
          eventLog={world.eventLog}
        />

        <RightColumn
          mode={mode}
          nations={world.nations}
          selectedNation={selectedNation}
          onSelectNation={setSelectedNationId}
          onToggleLaw={toggleLawAction}
          onSetPopulation={setPopulationAction}
          onAdjustPopulation={adjustPopulationAction}
          onAddTreasury={addTreasuryAction}
          onSpawnCitizen={spawnCitizenAction}
          onCastBlessing={castBlessingAction}
        />
      </main>

      {inspectedPerson && (
        <PersonInspectorModal
          person={inspectedPerson}
          mode={mode}
          onClose={() => setInspectedPersonId(null)}
          onToggleTrait={togglePersonTraitAction}
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
  totalPopulation,
  isRunning,
  mode,
  onToggleRunning,
  onToggleMode,
}: {
  day: number;
  techEraName: string;
  totalPopulation: number;
  isRunning: boolean;
  mode: Mode;
  onToggleRunning: () => void;
  onToggleMode: () => void;
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
        <StatPill icon={Users} label="Pop" value={totalPopulation.toLocaleString()} />

        <button
          onClick={onToggleRunning}
          className="flex items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/10"
        >
          {isRunning ? <Pause size={14} /> : <Play size={14} />}
          {isRunning ? "Pause" : "Resume"}
        </button>

        <ModeToggle mode={mode} onToggle={onToggleMode} />
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

function ModeToggle({ mode, onToggle }: { mode: Mode; onToggle: () => void }) {
  const isGod = mode === "god";
  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
        isGod
          ? "border-fuchsia-500/50 bg-fuchsia-500/10 text-fuchsia-300 hover:bg-fuchsia-500/20"
          : "border-amber-500/50 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
      }`}
      title="Toggle Ruler Mode / God Mode"
    >
      {isGod ? <Sparkles size={14} /> : <Crown size={14} />}
      {isGod ? "God Mode" : "Ruler Mode"}
    </button>
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
                p.alive ? "hover:bg-white/5" : "cursor-not-allowed opacity-40"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1 truncate text-sm font-medium text-slate-100">
                  {p.name}
                  {!p.alive && (
                    <span className="ml-1.5 text-[10px] text-slate-500">(deceased)</span>
                  )}
                  {p.traits.includes(DIVINE_BLESSING_TRAIT) && (
                    <HeartPulse size={11} className="text-emerald-300" />
                  )}
                  {p.traits.includes(BUBONIC_PLAGUE_TRAIT) && (
                    <Biohazard size={11} className="text-rose-400" />
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
      <span className="shrink-0 text-[10px] font-semibold text-fuchsia-300">Lv.{level}</span>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-fuchsia-400/80" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function NeedsBars({ hunger, energy, mood }: { hunger: number; energy: number; mood: number }) {
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
/* Person inspector modal (wealth + traits + God Mode trait injection) */
/* ------------------------------------------------------------------ */

function PersonInspectorModal({
  person,
  mode,
  onClose,
  onToggleTrait,
}: {
  person: Person;
  mode: Mode;
  onClose: () => void;
  onToggleTrait: (personId: number, trait: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-lg border border-white/15 bg-slate-900 p-4 shadow-xl"
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-50">{person.name}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
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
          <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Traits</h4>
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

        {mode === "god" && (
          <div className="mt-4 border-t border-white/10 pt-3">
            <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-fuchsia-300">
              <Wand2 size={12} /> Trait Injection
            </h4>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onToggleTrait(person.id, DIVINE_BLESSING_TRAIT)}
                className={`flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                  person.traits.includes(DIVINE_BLESSING_TRAIT)
                    ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                    : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                <HeartPulse size={12} /> Divine Blessing
              </button>
              <button
                onClick={() => onToggleTrait(person.id, BUBONIC_PLAGUE_TRAIT)}
                className={`flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                  person.traits.includes(BUBONIC_PLAGUE_TRAIT)
                    ? "border-rose-500/50 bg-rose-500/15 text-rose-300"
                    : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                <Biohazard size={12} /> Bubonic Plague
              </button>
            </div>
            <p className="mt-1.5 text-[10px] text-slate-500">
              Divine Blessing doubles XP gain. Bubonic Plague slashes hunger and energy 15% every tick. Click again to lift.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Middle column: Cosmic Age card, crisis strip, scrolling event log   */
/* ------------------------------------------------------------------ */

function MiddleColumn({
  cosmicAge,
  day,
  livingPopulation,
  activeCrises,
  eventLog,
}: {
  cosmicAge: ReturnType<typeof getCosmicAge>;
  day: number;
  livingPopulation: number;
  activeCrises: Nation[];
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
        <p className="text-sm leading-relaxed text-slate-300">{cosmicAge.description}</p>
        <div className="mt-3 flex items-center gap-3 text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <Clock size={12} /> Day {day}
          </span>
          <span className="flex items-center gap-1">
            <Users size={12} /> {livingPopulation} notable citizens
          </span>
        </div>
      </div>

      {activeCrises.length > 0 && (
        <div className="flex flex-col gap-2">
          {activeCrises.map((n) => (
            <div
              key={n.id}
              className="flex items-center gap-2 rounded-md border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-xs text-orange-200"
            >
              <AlertTriangle size={14} className="shrink-0 text-orange-400" />
              <span>
                <span className="font-semibold">{n.name}:</span>{" "}
                {n.activeCrisis && CRISIS_LABEL[n.activeCrisis.type]} —{" "}
                {n.activeCrisis?.ticksRemaining} day(s) remaining
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex max-h-[calc(100vh-20rem)] flex-1 flex-col rounded-lg border border-white/10 bg-slate-950/40">
        <h3 className="flex items-center gap-1.5 border-b border-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
          <ScrollText size={13} /> Event Log
        </h3>
        <ul className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {recentEvents.length === 0 ? (
            <li className="text-xs text-slate-500">Nothing has happened yet.</li>
          ) : (
            recentEvents.map((e, i) => (
              <li key={`${e.day}-${i}`} className="text-xs leading-relaxed">
                <span className="mr-1.5 font-mono text-slate-600">D{e.day}</span>
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
/* Right column: commodity exchange + Nation Control Panel             */
/* ------------------------------------------------------------------ */

function RightColumn({
  mode,
  nations,
  selectedNation,
  onSelectNation,
  onToggleLaw,
  onSetPopulation,
  onAdjustPopulation,
  onAddTreasury,
  onSpawnCitizen,
  onCastBlessing,
}: {
  mode: Mode;
  nations: Nation[];
  selectedNation: Nation | undefined;
  onSelectNation: (id: number) => void;
  onToggleLaw: (nationId: number, lawId: LawId) => void;
  onSetPopulation: (nationId: number, population: number) => void;
  onAdjustPopulation: (nationId: number, delta: number) => void;
  onAddTreasury: (nationId: number, amount: number) => void;
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
          {nations.map((n) => {
            const active = n.id === selectedNation?.id;
            return (
              <li key={n.id}>
                <button
                  onClick={() => onSelectNation(n.id)}
                  className={`flex w-full flex-col gap-2 p-3 text-left transition-colors ${
                    active ? "bg-white/10" : "hover:bg-white/5"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-100">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: n.color }}
                      />
                      {n.name}
                      {n.atWarWith.length > 0 && <Swords size={12} className="text-rose-400" />}
                    </span>
                    <span className="flex items-center gap-1 font-mono text-xs text-amber-300">
                      <Landmark size={12} /> {Math.round(n.treasury).toLocaleString()} gp
                    </span>
                  </div>

                  {n.market.map((g) => {
                    const Icon = GOOD_ICON[g.name];
                    return (
                      <div
                        key={g.name}
                        className="flex items-center justify-between rounded bg-white/5 px-2 py-1.5 text-xs"
                      >
                        <span className="flex items-center gap-1.5 text-slate-300">
                          <Icon size={12} className="text-slate-400" />
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
                    );
                  })}

                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span>Pop {n.population.toLocaleString()} · Tech {Math.round(n.technology)}</span>
                    {n.militaryMight > 0 && (
                      <span className="flex items-center gap-1 text-sky-300">
                        <ShieldPlus size={10} /> Might {Math.round(n.militaryMight)}
                      </span>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {selectedNation &&
        (mode === "ruler" ? (
          <RulerPanel nation={selectedNation} onToggleLaw={onToggleLaw} />
        ) : (
          <GodPanel
            nation={selectedNation}
            onSetPopulation={onSetPopulation}
            onAdjustPopulation={onAdjustPopulation}
            onAddTreasury={onAddTreasury}
            onSpawnCitizen={onSpawnCitizen}
            onCastBlessing={onCastBlessing}
          />
        ))}
    </section>
  );
}

/** Price-trend "flasher": colored delta text with a direction chevron. */
function PriceDelta({ delta }: { delta: number }) {
  if (delta > 0) {
    return (
      <span className="flex items-center gap-0.5 font-mono text-[10px] font-semibold text-emerald-400">
        <ChevronUp size={11} strokeWidth={3} />+{delta.toFixed(2)}
      </span>
    );
  }
  if (delta < 0) {
    return (
      <span className="flex items-center gap-0.5 font-mono text-[10px] font-semibold text-red-400">
        <ChevronDown size={11} strokeWidth={3} />
        {delta.toFixed(2)}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-0.5 font-mono text-[10px] text-slate-600">
      <Minus size={11} strokeWidth={3} />
      0.00
    </span>
  );
}

/** Supply-vs-demand scarcity badge. */
function ScarcityBadge({ supply, demand }: { supply: number; demand: number }) {
  if (supply >= demand * 1.5) {
    return (
      <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-400">
        Abundant
      </span>
    );
  }
  if (supply < demand) {
    return (
      <span className="rounded-full bg-red-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-red-400">
        Deficit
      </span>
    );
  }
  return (
    <span className="rounded-full bg-slate-700/60 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
      Stable
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Ruler Mode: Active Legislation Policy Matrix                        */
/* ------------------------------------------------------------------ */

function RulerPanel({
  nation,
  onToggleLaw,
}: {
  nation: Nation;
  onToggleLaw: (nationId: number, lawId: LawId) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-300">
        <Crown size={16} /> Ruler Mode — {nation.name}
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        Pass laws to permanently reshape this nation's economy while they remain active.
      </p>

      <ul className="mt-4 space-y-2">
        {nation.laws.map((l) => (
          <LawRow key={l.id} law={l} nation={nation} onToggleLaw={onToggleLaw} />
        ))}
      </ul>
    </div>
  );
}

function LawRow({
  law,
  nation,
  onToggleLaw,
}: {
  law: Law;
  nation: Nation;
  onToggleLaw: (nationId: number, lawId: LawId) => void;
}) {
  const canAfford = law.active || nation.treasury >= law.cost;
  return (
    <li className="flex items-start justify-between gap-3 rounded-md border border-slate-800 bg-slate-800/40 p-3">
      <div>
        <p className="text-sm font-medium text-slate-100">{law.name}</p>
        <p className="text-xs text-slate-500">{law.description}</p>
        {!law.active && (
          <p className={`mt-1 text-[11px] font-mono ${canAfford ? "text-amber-300" : "text-red-400"}`}>
            Cost: {law.cost.toLocaleString()} gp
          </p>
        )}
      </div>
      <button
        onClick={() => onToggleLaw(nation.id, law.id)}
        disabled={!law.active && !canAfford}
        className={`shrink-0 rounded-md px-3 py-1 text-xs font-semibold ${
          law.active
            ? "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
            : canAfford
            ? "bg-slate-700 text-slate-300 hover:bg-slate-600"
            : "cursor-not-allowed bg-slate-800 text-slate-600"
        }`}
      >
        {law.active ? "Repeal" : "Pass Law"}
      </button>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* God Mode: Divine Intervention Toolkit                               */
/* ------------------------------------------------------------------ */

function GodPanel({
  nation,
  onSetPopulation,
  onAdjustPopulation,
  onAddTreasury,
  onSpawnCitizen,
  onCastBlessing,
}: {
  nation: Nation;
  onSetPopulation: (nationId: number, population: number) => void;
  onAdjustPopulation: (nationId: number, delta: number) => void;
  onAddTreasury: (nationId: number, amount: number) => void;
  onSpawnCitizen: () => void;
  onCastBlessing: () => void;
}) {
  const [populationInput, setPopulationInput] = useState(String(nation.population));

  useEffect(() => {
    setPopulationInput(String(nation.population));
  }, [nation.id, nation.population]);

  return (
    <div className="rounded-lg border border-fuchsia-500/30 bg-slate-950 p-4 shadow-[0_0_0_1px_rgba(217,70,239,0.05)]">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-fuchsia-300">
        <Wand2 size={16} /> Divine Intervention Toolkit — {nation.name}
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        Reach directly into the simulation. Every change here applies instantly.
      </p>

      {/* --- Population Editor ------------------------------------- */}
      <div className="mt-4 rounded-md border border-slate-800 bg-slate-900/60 p-3">
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <Users size={13} /> Population Editor
        </h3>
        <div className="flex gap-2">
          <input
            type="number"
            value={populationInput}
            onChange={(e) => setPopulationInput(e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 font-mono text-sm text-slate-100 focus:border-fuchsia-500 focus:outline-none"
          />
          <button
            onClick={() => {
              const parsed = Number(populationInput);
              if (!Number.isNaN(parsed)) onSetPopulation(nation.id, parsed);
            }}
            className="shrink-0 rounded-md bg-fuchsia-500/20 px-3 py-1.5 text-xs font-semibold text-fuchsia-300 hover:bg-fuchsia-500/30"
          >
            Set
          </button>
        </div>
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => onAdjustPopulation(nation.id, POPULATION_QUICK_STEP)}
            className="flex-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20"
          >
            +10k Pop
          </button>
          <button
            onClick={() => onAdjustPopulation(nation.id, -POPULATION_QUICK_STEP)}
            className="flex-1 rounded-md border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/20"
          >
            -10k Pop
          </button>
        </div>
      </div>

      {/* --- Treasury Spawner ---------------------------------------- */}
      <div className="mt-3 rounded-md border border-slate-800 bg-slate-900/60 p-3">
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <Landmark size={13} /> Treasury Spawner
        </h3>
        <button
          onClick={() => onAddTreasury(nation.id, TREASURY_SPAWN_AMOUNT)}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/20"
        >
          <Coins size={13} /> Spawn {TREASURY_SPAWN_AMOUNT.toLocaleString()} gp
        </button>
      </div>

      {/* --- Global divine actions ------------------------------------ */}
      <div className="mt-3 rounded-md border border-slate-800 bg-slate-900/60 p-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Global Interventions
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
        <p className="mt-2 text-[10px] text-slate-500">
          For Divine Blessing / Bubonic Plague trait injection, open an inhabitant from the left column while in God Mode.
        </p>
      </div>
    </div>
  );
}
