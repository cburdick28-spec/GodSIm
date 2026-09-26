"use client";

// app/page.tsx
// GodSim main dashboard: header bar + two-column layout (nation/market
// browser on the left, mode-dependent control panel on the right).
//
// Dependencies: zustand, lucide-react
//   npm i zustand lucide-react

import { useEffect, useMemo, useState } from "react";
import {
  Crown,
  Sparkles,
  Play,
  Pause,
  Coins,
  Clock,
  Users,
  Scroll,
  Wheat,
  Hammer,
  Gem,
  Skull,
  Plus,
  Trash2,
} from "lucide-react";
import { useGameStore } from "@/lib/store";
import type { GoodName, Nation } from "@/lib/types";

const GOOD_ICON: Record<GoodName, typeof Wheat> = {
  Food: Wheat,
  Iron: Hammer,
  Luxury: Gem,
};

const PRESET_TRAITS: { name: string; populationModifier: number }[] = [
  { name: "Blessing", populationModifier: 0.02 },
  { name: "Plague", populationModifier: -0.04 },
  { name: "Golden Age", populationModifier: 0.015 },
  { name: "Famine", populationModifier: -0.02 },
];

export default function Page() {
  const {
    tick,
    balance,
    mode,
    isRunning,
    selectedNationId,
    nations,
    toggleMode,
    setRunning,
    selectNation,
    toggleLaw,
    setTaxRate,
    setPopulation,
    addTrait,
    removeTrait,
  } = useGameStore();

  // --- simulation loop: 1 tick per second while running -----------------
  // Reads the action via `useGameStore.getState()` inside the interval
  // callback rather than closing over the destructured `advanceTick` above.
  // That decouples the loop from React's render cycle entirely: the
  // callback always calls whatever the *current* store action is, so there
  // is no stale closure even across fast-refresh/store re-init, and since
  // the effect's only dependency is `isRunning`, toggling pause/resume is
  // the only thing that ever tears down and recreates the interval — ticking
  // itself never touches this effect, so it can't re-trigger itself.
  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => {
      useGameStore.getState().advanceTick();
    }, 1000);
    return () => clearInterval(id);
  }, [isRunning]);

  const selectedNation = useMemo(
    () => nations.find((n) => n.id === selectedNationId) ?? nations[0],
    [nations, selectedNationId]
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <HeaderBar
        tick={tick}
        balance={balance}
        mode={mode}
        isRunning={isRunning}
        onToggleMode={toggleMode}
        onToggleRunning={() => setRunning(!isRunning)}
      />

      <main className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-[380px_1fr]">
        <LeftColumn
          nations={nations}
          selectedNation={selectedNation}
          onSelectNation={selectNation}
        />

        <RightColumn
          mode={mode}
          nation={selectedNation}
          onToggleLaw={toggleLaw}
          onSetTaxRate={setTaxRate}
          onSetPopulation={setPopulation}
          onAddTrait={addTrait}
          onRemoveTrait={removeTrait}
        />
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */

function HeaderBar({
  tick,
  balance,
  mode,
  isRunning,
  onToggleMode,
  onToggleRunning,
}: {
  tick: number;
  balance: number;
  mode: "ruler" | "god";
  isRunning: boolean;
  onToggleMode: () => void;
  onToggleRunning: () => void;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-900/70 px-4 py-3 backdrop-blur">
      <div className="flex items-center gap-2">
        <span className="text-lg font-bold tracking-tight text-slate-50">
          GodSim
        </span>
        <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
          alpha
        </span>
      </div>

      <div className="flex items-center gap-4 text-sm">
        <StatPill icon={Clock} label="Tick" value={tick.toLocaleString()} />
        <StatPill
          icon={Coins}
          label="Balance"
          value={`${Math.round(balance).toLocaleString()} gp`}
          accent="text-amber-400"
        />

        <button
          onClick={onToggleRunning}
          className="flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
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
  accent = "text-slate-100",
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-slate-800 bg-slate-900 px-3 py-1.5">
      <Icon size={14} className="text-slate-500" />
      <span className="text-slate-500">{label}</span>
      <span className={`font-mono font-semibold ${accent}`}>{value}</span>
    </div>
  );
}

function ModeToggle({
  mode,
  onToggle,
}: {
  mode: "ruler" | "god";
  onToggle: () => void;
}) {
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
/* Left column: nation list + detail + market board                    */
/* ------------------------------------------------------------------ */

function LeftColumn({
  nations,
  selectedNation,
  onSelectNation,
}: {
  nations: Nation[];
  selectedNation: Nation | undefined;
  onSelectNation: (id: string) => void;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="rounded-lg border border-slate-800 bg-slate-900">
        <h2 className="border-b border-slate-800 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Nations
        </h2>
        <ul className="divide-y divide-slate-800">
          {nations.map((n) => {
            const active = n.id === selectedNation?.id;
            return (
              <li key={n.id}>
                <button
                  onClick={() => onSelectNation(n.id)}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors ${
                    active
                      ? "bg-slate-800 text-slate-50"
                      : "text-slate-300 hover:bg-slate-800/60"
                  }`}
                >
                  <span className="font-medium">{n.name}</span>
                  <span className="flex items-center gap-1 font-mono text-xs text-slate-400">
                    <Users size={12} />
                    {n.population.toLocaleString()}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {selectedNation && (
        <>
          <NationSummary nation={selectedNation} />
          <MarketBoard nation={selectedNation} />
        </>
      )}
    </section>
  );
}

function NationSummary({ nation }: { nation: Nation }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
      <h3 className="mb-2 text-sm font-semibold text-slate-100">
        {nation.name}
      </h3>
      <dl className="grid grid-cols-2 gap-2 text-xs">
        <Stat label="Population" value={nation.population.toLocaleString()} />
        <Stat
          label="Treasury"
          value={`${Math.round(nation.treasury).toLocaleString()} gp`}
        />
        <Stat label="Tax Rate" value={`${Math.round(nation.taxRate * 100)}%`} />
        <Stat
          label="Active Laws"
          value={String(nation.laws.filter((l) => l.active).length)}
        />
      </dl>

      <div className="mt-3">
        <h4 className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <Scroll size={12} /> Laws
        </h4>
        {nation.laws.length === 0 ? (
          <p className="text-xs text-slate-500">No laws on the books.</p>
        ) : (
          <ul className="space-y-1">
            {nation.laws.map((l) => (
              <li
                key={l.id}
                className="flex items-center justify-between rounded bg-slate-800/60 px-2 py-1 text-xs"
              >
                <span className={l.active ? "text-slate-100" : "text-slate-500"}>
                  {l.name}
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    l.active
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-slate-700 text-slate-400"
                  }`}
                >
                  {l.active ? "Active" : "Inactive"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {nation.traits.length > 0 && (
        <div className="mt-3">
          <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Traits
          </h4>
          <div className="flex flex-wrap gap-1">
            {nation.traits.map((t) => (
              <span
                key={t.id}
                className="rounded-full border border-fuchsia-500/40 bg-fuchsia-500/10 px-2 py-0.5 text-[10px] text-fuchsia-300"
              >
                {t.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-mono text-slate-200">{value}</dd>
    </div>
  );
}

function MarketBoard({ nation }: { nation: Nation }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900">
      <h3 className="border-b border-slate-800 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Market Board
      </h3>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-slate-500">
            <th className="px-3 py-1.5 font-medium">Good</th>
            <th className="px-3 py-1.5 font-medium">Price</th>
            <th className="px-3 py-1.5 font-medium">Supply</th>
            <th className="px-3 py-1.5 font-medium">Demand</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {nation.market.map((g) => {
            const Icon = GOOD_ICON[g.name];
            const deltaColor =
              g.delta > 0
                ? "text-rose-400"
                : g.delta < 0
                ? "text-emerald-400"
                : "text-slate-500";
            return (
              <tr key={g.name} className="text-slate-300">
                <td className="flex items-center gap-1.5 px-3 py-1.5">
                  <Icon size={13} className="text-slate-500" />
                  {g.name}
                </td>
                <td className="px-3 py-1.5 font-mono">
                  {g.price.toFixed(2)}{" "}
                  <span className={`text-[10px] ${deltaColor}`}>
                    ({g.delta >= 0 ? "+" : ""}
                    {g.delta.toFixed(2)})
                  </span>
                </td>
                <td className="px-3 py-1.5 font-mono">{Math.round(g.supply)}</td>
                <td className="px-3 py-1.5 font-mono">{Math.round(g.demand)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Right column: Ruler Mode controls / God Mode inspector              */
/* ------------------------------------------------------------------ */

function RightColumn({
  mode,
  nation,
  onToggleLaw,
  onSetTaxRate,
  onSetPopulation,
  onAddTrait,
  onRemoveTrait,
}: {
  mode: "ruler" | "god";
  nation: Nation | undefined;
  onToggleLaw: (nationId: string, lawId: string) => void;
  onSetTaxRate: (nationId: string, rate: number) => void;
  onSetPopulation: (nationId: string, population: number) => void;
  onAddTrait: (nationId: string, traitName: string, populationModifier: number) => void;
  onRemoveTrait: (nationId: string, traitId: string) => void;
}) {
  if (!nation) {
    return (
      <section className="rounded-lg border border-slate-800 bg-slate-900 p-6 text-center text-sm text-slate-500">
        Select a nation to begin.
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      {mode === "ruler" ? (
        <RulerPanel
          nation={nation}
          onToggleLaw={onToggleLaw}
          onSetTaxRate={onSetTaxRate}
        />
      ) : (
        <GodPanel
          nation={nation}
          onSetPopulation={onSetPopulation}
          onAddTrait={onAddTrait}
          onRemoveTrait={onRemoveTrait}
        />
      )}
    </section>
  );
}

function RulerPanel({
  nation,
  onToggleLaw,
  onSetTaxRate,
}: {
  nation: Nation;
  onToggleLaw: (nationId: string, lawId: string) => void;
  onSetTaxRate: (nationId: string, rate: number) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-300">
          <Crown size={16} /> Ruler Mode — {nation.name}
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Pass laws and set taxation for your people.
        </p>
      </div>

      <div>
        <label className="mb-1 flex items-center justify-between text-xs font-medium text-slate-300">
          <span>Tax Rate</span>
          <span className="font-mono text-amber-300">
            {Math.round(nation.taxRate * 100)}%
          </span>
        </label>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(nation.taxRate * 100)}
          onChange={(e) => onSetTaxRate(nation.id, Number(e.target.value) / 100)}
          className="w-full accent-amber-500"
        />
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Legislation
        </h3>
        <ul className="space-y-2">
          {nation.laws.map((l) => (
            <li
              key={l.id}
              className="flex items-start justify-between gap-3 rounded-md border border-slate-800 bg-slate-800/40 p-3"
            >
              <div>
                <p className="text-sm font-medium text-slate-100">{l.name}</p>
                <p className="text-xs text-slate-500">{l.description}</p>
              </div>
              <button
                onClick={() => onToggleLaw(nation.id, l.id)}
                className={`shrink-0 rounded-md px-3 py-1 text-xs font-semibold ${
                  l.active
                    ? "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
                    : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                }`}
              >
                {l.active ? "Repeal" : "Pass Law"}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function GodPanel({
  nation,
  onSetPopulation,
  onAddTrait,
  onRemoveTrait,
}: {
  nation: Nation;
  onSetPopulation: (nationId: string, population: number) => void;
  onAddTrait: (nationId: string, traitName: string, populationModifier: number) => void;
  onRemoveTrait: (nationId: string, traitId: string) => void;
}) {
  const [populationInput, setPopulationInput] = useState(
    String(nation.population)
  );
  const [customTrait, setCustomTrait] = useState("");

  // keep the input in sync when the selected nation changes underneath us
  useEffect(() => {
    setPopulationInput(String(nation.population));
  }, [nation.id, nation.population]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-fuchsia-300">
          <Sparkles size={16} /> God Mode — {nation.name}
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Directly inspect and edit the simulation state.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-300">
          Population (direct edit)
        </label>
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
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Apply Trait
        </h3>
        <div className="flex flex-wrap gap-2">
          {PRESET_TRAITS.map((t) => (
            <button
              key={t.name}
              onClick={() => onAddTrait(nation.id, t.name, t.populationModifier)}
              className="flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 hover:border-fuchsia-500/50 hover:bg-slate-700"
            >
              {t.name === "Plague" || t.name === "Famine" ? (
                <Skull size={12} className="text-rose-400" />
              ) : (
                <Sparkles size={12} className="text-amber-300" />
              )}
              {t.name}
            </button>
          ))}
        </div>

        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={customTrait}
            onChange={(e) => setCustomTrait(e.target.value)}
            placeholder="Custom trait name…"
            className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-fuchsia-500 focus:outline-none"
          />
          <button
            onClick={() => {
              if (!customTrait.trim()) return;
              onAddTrait(nation.id, customTrait.trim(), 0);
              setCustomTrait("");
            }}
            className="flex shrink-0 items-center gap-1 rounded-md bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-600"
          >
            <Plus size={12} /> Add
          </button>
        </div>
      </div>

      {nation.traits.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Active Traits
          </h3>
          <ul className="space-y-1.5">
            {nation.traits.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-800/40 px-3 py-1.5 text-xs"
              >
                <span className="text-slate-200">
                  {t.name}{" "}
                  <span className="text-slate-500">
                    (tick {t.appliedAtTick})
                  </span>
                </span>
                <button
                  onClick={() => onRemoveTrait(nation.id, t.id)}
                  className="text-slate-500 hover:text-rose-400"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
