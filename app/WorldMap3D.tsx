"use client";

// app/WorldMap3D.tsx
//
// three.js rendering of the WorldBox-style world map, via react-three-fiber
// + drei. Client-only (loaded through next/dynamic with ssr:false from
// app/page.tsx) since WebGL has no meaning during Next's static build step.
//
// Pure rendering layer: all map/terrain/territory data and the paint action
// already live in lib/simulationEngine.ts (generateMap, computeTerritory,
// paintTerrain) — this component only visualizes `world` and forwards God
// Mode clicks back to the same onPaintTile callback the old 2D grid used,
// plus (new) Ruler Mode tile clicks that select the owning nation.

import { useMemo, useRef, useState } from "react";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Html, Instances, Instance } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import {
  computeTerritory,
  MAP_WIDTH,
  MAP_HEIGHT,
  type WorldState,
  type TerrainType,
  type Nation,
  type CosmicAge,
} from "@/lib/simulationEngine";

export const TERRAIN_COLOR: Record<TerrainType, string> = {
  Water: "#1e40af",
  Plains: "#4d7c0f",
  Hills: "#8a8f3d",
  Forest: "#166534",
  Mountain: "#57534e",
  Desert: "#b45309",
};

/** Extrusion height per terrain, in scene units — this is what turns the
 * flat tile grid into an actual landscape (mountains rise, water sits low
 * and nearly flat so it reads as a sheet of water rather than a block). */
const TERRAIN_HEIGHT: Record<TerrainType, number> = {
  Water: 0.08,
  Plains: 0.4,
  Hills: 0.65,
  Desert: 0.45,
  Forest: 0.75,
  Mountain: 1.5,
};

/** Soft ambient tint per Cosmic Age, so the map's lighting subtly shifts
 * with the era instead of staying static the whole game. */
const AGE_LIGHT_TINT: Record<CosmicAge["colorTheme"], string> = {
  emerald: "#bbf7d0",
  slate: "#cbd5e1",
  rose: "#fecdd3",
  cyan: "#a5f3fc",
};

type Mode = "ruler" | "god";

interface WorldMap3DProps {
  world: WorldState;
  mode: Mode;
  terrainBrush: TerrainType;
  cosmicAge: CosmicAge;
  onPaintTile: (x: number, y: number, terrain: TerrainType) => void;
  onSelectNation: (nationId: number) => void;
}

function TileMesh({
  x,
  y,
  terrain,
  owner,
  isCapital,
  paintable,
  selectable,
  onPaint,
  onSelect,
}: {
  x: number;
  y: number;
  terrain: TerrainType;
  owner?: Nation;
  isCapital: boolean;
  paintable: boolean;
  selectable: boolean;
  onPaint: () => void;
  onSelect: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const height = TERRAIN_HEIGHT[terrain];
  const color = TERRAIN_COLOR[terrain];
  const interactive = paintable || selectable;
  const isWater = terrain === "Water";

  return (
    <group position={[x, 0, y]}>
      <mesh
        position={[0, height / 2, 0]}
        castShadow={!isWater}
        receiveShadow
        onClick={(e: ThreeEvent<MouseEvent>) => {
          if (!interactive) return;
          e.stopPropagation();
          if (paintable) onPaint();
          else onSelect();
        }}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          if (!interactive) return;
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
      >
        <boxGeometry args={[0.92, height, 0.92]} />
        <meshStandardMaterial
          color={color}
          transparent={isWater}
          opacity={isWater ? 0.82 : 1}
          roughness={isWater ? 0.15 : 0.9}
          metalness={isWater ? 0.35 : 0}
          emissive={hovered ? "#d946ef" : "#000000"}
          emissiveIntensity={hovered ? 0.5 : 0}
        />
      </mesh>

      {/* Territory tint: a thin colored plane resting on the tile top. */}
      {owner && (
        <mesh position={[0, height + 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.94, 0.94]} />
          <meshBasicMaterial color={owner.color} transparent opacity={0.4} depthWrite={false} />
        </mesh>
      )}

      {/* Capital marker: a small colored pin. */}
      {isCapital && owner && (
        <mesh position={[0, height + 0.35, 0]} castShadow>
          <coneGeometry args={[0.2, 0.5, 6]} />
          <meshStandardMaterial color={owner.color} emissive={owner.color} emissiveIntensity={0.35} />
        </mesh>
      )}

      {/* Hover tooltip: tile + terrain + owner info, in either mode. */}
      {hovered && (
        <Html position={[0, height + 0.6, 0]} center distanceFactor={14} style={{ pointerEvents: "none" }}>
          <div className="whitespace-nowrap rounded border border-white/20 bg-slate-950/90 px-2 py-1 text-[10px] font-semibold text-slate-100 shadow-lg">
            <div>
              {terrain} · ({x}, {y})
            </div>
            {owner && <div style={{ color: owner.color }}>{owner.name}{isCapital ? " (Capital)" : ""}</div>}
            {paintable && <div className="text-fuchsia-300">Click to paint</div>}
            {selectable && owner && <div className="text-amber-300">Click to inspect</div>}
          </div>
        </Html>
      )}
    </group>
  );
}

/** Small instanced "tree" props scattered on Forest tiles — purely
 * decorative, not interactive, so they're batched into one draw call via
 * drei's <Instances> rather than one mesh per tree. */
function ForestProps({ tiles }: { tiles: { x: number; y: number }[] }) {
  const trees = useMemo(() => {
    const out: Array<{ x: number; y: number; scale: number }> = [];
    for (const t of tiles) {
      const count = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < count; i++) {
        out.push({
          x: t.x + (Math.random() - 0.5) * 0.6,
          y: t.y + (Math.random() - 0.5) * 0.6,
          scale: 0.7 + Math.random() * 0.5,
        });
      }
    }
    return out;
  }, [tiles]);

  if (trees.length === 0) return null;

  return (
    <Instances limit={trees.length} castShadow>
      <coneGeometry args={[0.14, 0.42, 6]} />
      <meshStandardMaterial color="#0f3d1f" roughness={0.85} />
      {trees.map((t, i) => (
        <Instance key={i} position={[t.x, TERRAIN_HEIGHT.Forest + 0.21 * t.scale, t.y]} scale={t.scale} />
      ))}
    </Instances>
  );
}

export default function WorldMap3D({
  world,
  mode,
  terrainBrush,
  cosmicAge,
  onPaintTile,
  onSelectNation,
}: WorldMap3DProps) {
  const territory = useMemo(() => computeTerritory(world), [world]);
  const nationById = useMemo(() => new Map(world.nations.map((n) => [n.id, n])), [world.nations]);
  const capitalKeys = useMemo(
    () => new Set(world.nations.map((n) => `${n.capital[0]},${n.capital[1]}`)),
    [world.nations]
  );
  const forestTiles = useMemo(
    () => world.map.filter((t) => t.terrain === "Forest").map((t) => ({ x: t.x, y: t.y })),
    [world.map]
  );

  const paintable = mode === "god";
  const selectable = mode === "ruler";
  const ageTint = AGE_LIGHT_TINT[cosmicAge.colorTheme];

  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const handleResetView = () => controlsRef.current?.reset();

  return (
    <div className="relative h-[360px] w-full overflow-hidden rounded-md border border-black/40 bg-slate-950">
      <Canvas shadows camera={{ position: [15, 18, 22], fov: 42 }}>
        <fog attach="fog" args={["#0b1220", 20, 48]} />
        <ambientLight intensity={0.5} color={ageTint} />
        <directionalLight
          position={[10, 16, 7]}
          intensity={1.2}
          color={ageTint}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        <hemisphereLight args={["#1e293b", "#0f172a", 0.6]} />

        <group position={[-(MAP_WIDTH - 1) / 2, 0, -(MAP_HEIGHT - 1) / 2]}>
          {world.map.map((tile) => {
            const key = `${tile.x},${tile.y}`;
            const ownerId = territory.get(key);
            const owner = ownerId !== undefined ? nationById.get(ownerId) : undefined;
            return (
              <TileMesh
                key={key}
                x={tile.x}
                y={tile.y}
                terrain={tile.terrain}
                owner={owner}
                isCapital={capitalKeys.has(key)}
                paintable={paintable}
                selectable={selectable}
                onPaint={() => onPaintTile(tile.x, tile.y, terrainBrush)}
                onSelect={() => owner && onSelectNation(owner.id)}
              />
            );
          })}
          <ForestProps tiles={forestTiles} />
        </group>

        <OrbitControls
          ref={controlsRef}
          enablePan
          enableDamping
          dampingFactor={0.1}
          minDistance={6}
          maxDistance={46}
          maxPolarAngle={Math.PI / 2.15}
        />
      </Canvas>

      <button
        type="button"
        onClick={handleResetView}
        className="absolute bottom-2 right-2 rounded border border-white/20 bg-slate-900/80 px-2 py-1 text-[10px] font-semibold text-slate-200 hover:bg-slate-800"
      >
        Reset View
      </button>
    </div>
  );
}
