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
// Mode clicks back to the same onPaintTile callback the old 2D grid used.

import { useMemo, useState } from "react";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import {
  computeTerritory,
  MAP_WIDTH,
  MAP_HEIGHT,
  type WorldState,
  type TerrainType,
  type Nation,
} from "@/lib/simulationEngine";

export const TERRAIN_COLOR: Record<TerrainType, string> = {
  Water: "#1e40af",
  Plains: "#4d7c0f",
  Forest: "#166534",
  Mountain: "#57534e",
  Desert: "#b45309",
};

/** Extrusion height per terrain, in scene units — this is what turns the
 * flat tile grid into an actual landscape (mountains rise, water sits low). */
const TERRAIN_HEIGHT: Record<TerrainType, number> = {
  Water: 0.15,
  Plains: 0.4,
  Desert: 0.45,
  Forest: 0.75,
  Mountain: 1.4,
};

type Mode = "ruler" | "god";

interface WorldMap3DProps {
  world: WorldState;
  mode: Mode;
  terrainBrush: TerrainType;
  onPaintTile: (x: number, y: number, terrain: TerrainType) => void;
}

function TileMesh({
  x,
  y,
  terrain,
  owner,
  isCapital,
  interactive,
  onPaint,
}: {
  x: number;
  y: number;
  terrain: TerrainType;
  owner?: Nation;
  isCapital: boolean;
  interactive: boolean;
  onPaint: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const height = TERRAIN_HEIGHT[terrain];
  const color = TERRAIN_COLOR[terrain];

  return (
    <group position={[x, 0, y]}>
      <mesh
        position={[0, height / 2, 0]}
        castShadow
        receiveShadow
        onClick={(e: ThreeEvent<MouseEvent>) => {
          if (!interactive) return;
          e.stopPropagation();
          onPaint();
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
    </group>
  );
}

export default function WorldMap3D({ world, mode, terrainBrush, onPaintTile }: WorldMap3DProps) {
  const territory = useMemo(() => computeTerritory(world), [world]);
  const nationById = useMemo(() => new Map(world.nations.map((n) => [n.id, n])), [world.nations]);
  const capitalKeys = useMemo(
    () => new Set(world.nations.map((n) => `${n.capital[0]},${n.capital[1]}`)),
    [world.nations]
  );

  const interactive = mode === "god";

  return (
    <div className="h-[280px] w-full overflow-hidden rounded-md border border-black/40 bg-slate-950">
      <Canvas shadows camera={{ position: [11, 14, 17], fov: 42 }}>
        <ambientLight intensity={0.55} />
        <directionalLight
          position={[8, 14, 6]}
          intensity={1.2}
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
                interactive={interactive}
                onPaint={() => onPaintTile(tile.x, tile.y, terrainBrush)}
              />
            );
          })}
        </group>

        <OrbitControls
          enablePan
          enableDamping
          dampingFactor={0.1}
          minDistance={6}
          maxDistance={34}
          maxPolarAngle={Math.PI / 2.15}
        />
      </Canvas>
    </div>
  );
}
