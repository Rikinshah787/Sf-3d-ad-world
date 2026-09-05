# Town.CEO Isometric City Map — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a full clone of town.ceo — an interactive isometric LEGO-style SF city map where buildings represent projects/organizations, showing commit activity, with streets, decorations, and popup cards.

**Architecture:** A Next.js app renders a Three.js scene via React Three Fiber. The city is an isometric grid of LEGO-style baseplates connected by streets. Buildings are voxel-stacked boxes with LEGO studs, colored in a warm pastel palette. HTML overlay cards appear on hover showing project info. Camera supports pan/zoom in a locked isometric angle.

**Tech Stack:** Next.js 14 (App Router) · React Three Fiber · @react-three/drei · Three.js · TypeScript · Tailwind CSS 4

---

## Phase 1: Project Scaffolding

### Task 1: Initialize Next.js Project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`

**Step 1: Scaffold the project**

Run:
```bash
cd "f:/Time to build"
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --no-import-alias --use-npm
```

Accept all defaults. This creates the full Next.js scaffold.

**Step 2: Install Three.js dependencies**

Run:
```bash
npm install three @react-three/fiber @react-three/drei
npm install -D @types/three
```

**Step 3: Verify it runs**

Run:
```bash
npm run dev
```

Open `http://localhost:3000` — should see the default Next.js page.

**Step 4: Commit**

```bash
git init
git add -A
git commit -m "chore: scaffold Next.js + R3F project"
```

---

### Task 2: Set Up Project Structure & Types

**Files:**
- Create: `src/types/city.ts`
- Create: `src/data/projects.ts`
- Create: `src/data/cityGrid.ts`
- Create: `src/components/Scene.tsx`

**Step 1: Define the core types**

Create `src/types/city.ts`:

```typescript
// Grid position in the city
export interface GridPosition {
  row: number;
  col: number;
}

// A project that occupies a building
export interface Project {
  id: string;
  name: string;
  avatarUrl?: string;
  avatarText?: string;        // fallback 2-letter abbreviation
  avatarBgColor?: string;     // hex color for avatar bg
  commits: number;
  url?: string;
}

// Building on the map
export interface Building {
  id: string;
  position: GridPosition;
  project?: Project;          // undefined = decorative building
  height: number;             // number of "floors" (1-6)
  style: BuildingStyle;
}

export type BuildingStyle = 'tower' | 'wide' | 'skyscraper' | 'small';

// What occupies each cell in the grid
export type CellType =
  | 'grass'           // green LEGO baseplate
  | 'street-h'        // horizontal street
  | 'street-v'        // vertical street
  | 'intersection'    // street crossing
  | 'building'        // building plot
  | 'park';           // decorative park/open space

export interface CityCell {
  type: CellType;
  row: number;
  col: number;
  building?: Building;
  decoration?: DecorationKind[];
}

export type DecorationKind =
  | 'tree'
  | 'bench'
  | 'lamppost'
  | 'car-red'
  | 'car-blue'
  | 'car-orange';

// Full city grid
export interface CityGrid {
  rows: number;
  cols: number;
  cells: CityCell[][];
  cellSize: number;   // world-unit size of each cell
}
```

**Step 2: Create mock project data**

Create `src/data/projects.ts`:

```typescript
import { Project } from '@/types/city';

export const PROJECTS: Project[] = [
  {
    id: 'town-ceo',
    name: 'TOWN.CEO',
    avatarText: 'TC',
    avatarBgColor: '#ffffff',
    commits: 0,
    url: 'https://town.ceo',
  },
  {
    id: 'burning-token',
    name: 'burning-token',
    avatarText: 'BU',
    avatarBgColor: '#4F46E5',
    commits: 0,
  },
  {
    id: 'vanpelt-studio',
    name: 'VANPELT STUDIO',
    avatarText: 'VS',
    avatarBgColor: '#111111',
    commits: 12,
  },
  {
    id: 'pixel-forge',
    name: 'Pixel Forge',
    avatarText: 'PF',
    avatarBgColor: '#E11D48',
    commits: 47,
  },
  {
    id: 'neon-labs',
    name: 'Neon Labs',
    avatarText: 'NL',
    avatarBgColor: '#06B6D4',
    commits: 128,
  },
  {
    id: 'solar-sdk',
    name: 'Solar SDK',
    avatarText: 'SS',
    avatarBgColor: '#F59E0B',
    commits: 64,
  },
  {
    id: 'moss-ui',
    name: 'Moss UI',
    avatarText: 'MU',
    avatarBgColor: '#10B981',
    commits: 33,
  },
  {
    id: 'cloud-nine',
    name: 'Cloud Nine',
    avatarText: 'C9',
    avatarBgColor: '#8B5CF6',
    commits: 91,
  },
];
```

**Step 3: Create city grid layout**

Create `src/data/cityGrid.ts`:

```typescript
import { CityGrid, CityCell, CellType, Building, DecorationKind } from '@/types/city';
import { PROJECTS } from './projects';

const GRID_ROWS = 10;
const GRID_COLS = 10;
const CELL_SIZE = 4; // world units per cell

// Layout key:
// G = grass, H = street-h, V = street-v, X = intersection, B = building, P = park
const LAYOUT: string[] = [
  'G G B X H H X B G G',
  'G G G V G G V G G G',
  'B G B V G B V B G B',
  'X H H X H H X H H X',
  'H G G V G G V G G H',
  'H G B V G P V B G H',
  'X H H X H H X H H X',
  'B G B V G B V B G B',
  'G G G V G G V G G G',
  'G G B X H H X B G G',
];

function parseLayout(): CellType[][] {
  return LAYOUT.map(row =>
    row.split(' ').map(ch => {
      switch (ch) {
        case 'G': return 'grass';
        case 'H': return 'street-h';
        case 'V': return 'street-v';
        case 'X': return 'intersection';
        case 'B': return 'building';
        case 'P': return 'park';
        default:  return 'grass';
      }
    })
  );
}

// Map building cells to projects
function assignBuildings(grid: CellType[][]): Building[] {
  const buildingCells: { row: number; col: number }[] = [];

  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (grid[r][c] === 'building') {
        buildingCells.push({ row: r, col: c });
      }
    }
  }

  const heights = [2, 3, 4, 5, 3, 4, 2, 6, 3, 4, 2, 5];
  const styles: Building['style'][] = [
    'tower', 'wide', 'skyscraper', 'small',
    'tower', 'wide', 'tower', 'skyscraper',
    'small', 'wide', 'tower', 'small',
  ];

  return buildingCells.map((pos, i) => ({
    id: `building-${i}`,
    position: pos,
    project: i < PROJECTS.length ? PROJECTS[i] : undefined,
    height: heights[i % heights.length],
    style: styles[i % styles.length],
  }));
}

// Scatter decorations on grass/park cells
function assignDecorations(grid: CellType[][]): Map<string, DecorationKind[]> {
  const decos = new Map<string, DecorationKind[]>();
  const rng = (seed: number) => ((seed * 9301 + 49297) % 233280) / 233280;

  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const key = `${r}-${c}`;
      const type = grid[r][c];

      if (type === 'park') {
        decos.set(key, ['tree', 'tree', 'bench', 'lamppost']);
      } else if (type === 'grass') {
        const v = rng(r * 100 + c);
        if (v < 0.3) {
          decos.set(key, ['tree']);
        } else if (v < 0.4) {
          decos.set(key, ['bench']);
        } else if (v < 0.5) {
          decos.set(key, ['lamppost']);
        }
      } else if (type === 'street-h' || type === 'street-v') {
        const v = rng(r * 100 + c + 500);
        if (v < 0.15) {
          const cars: DecorationKind[] = ['car-red', 'car-blue', 'car-orange'];
          decos.set(key, [cars[Math.floor(v * 20) % 3]]);
        }
      }
    }
  }
  return decos;
}

export function buildCityGrid(): CityGrid {
  const layout = parseLayout();
  const buildings = assignBuildings(layout);
  const decorations = assignDecorations(layout);

  const cells: CityCell[][] = [];

  for (let r = 0; r < GRID_ROWS; r++) {
    const row: CityCell[] = [];
    for (let c = 0; c < GRID_COLS; c++) {
      const key = `${r}-${c}`;
      const cell: CityCell = {
        type: layout[r][c],
        row: r,
        col: c,
        decoration: decorations.get(key),
      };
      // Attach building if this cell is a building plot
      const bld = buildings.find(b => b.position.row === r && b.position.col === c);
      if (bld) cell.building = bld;
      row.push(cell);
    }
    cells.push(row);
  }

  return { rows: GRID_ROWS, cols: GRID_COLS, cells, cellSize: CELL_SIZE };
}
```

**Step 4: Create placeholder Scene component**

Create `src/components/Scene.tsx`:

```typescript
'use client';

import { Canvas } from '@react-three/fiber';
import { OrthographicCamera, MapControls } from '@react-three/drei';

export default function Scene() {
  return (
    <Canvas
      style={{ width: '100vw', height: '100vh', background: '#F5E6D3' }}
      gl={{ antialias: true }}
    >
      <OrthographicCamera
        makeDefault
        zoom={50}
        position={[20, 20, 20]}
        near={0.1}
        far={1000}
      />
      <MapControls
        enableRotate={false}
        minZoom={20}
        maxZoom={120}
        screenSpacePanning
      />
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 20, 10]} intensity={0.8} />
      {/* Temporary ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#C8DFC3" />
      </mesh>
    </Canvas>
  );
}
```

**Step 5: Wire Scene into the page**

Replace `src/app/page.tsx`:

```typescript
import dynamic from 'next/dynamic';

const Scene = dynamic(() => import('@/components/Scene'), { ssr: false });

export default function Home() {
  return (
    <main className="w-screen h-screen overflow-hidden">
      <Scene />
    </main>
  );
}
```

Update `src/app/globals.css` to just:

```css
@import "tailwindcss";

html, body {
  margin: 0;
  padding: 0;
  overflow: hidden;
}
```

**Step 6: Verify — green ground plane visible with isometric camera**

Run:
```bash
npm run dev
```

Open `http://localhost:3000` — should see a peach background with a green square ground plane from isometric angle. Pan/zoom should work.

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: add types, mock data, city grid, and basic 3D scene"
```

---

## Phase 2: LEGO Baseplates & Streets

### Task 3: Render the City Grid (Ground Tiles)

**Files:**
- Create: `src/components/city/Ground.tsx`
- Create: `src/components/city/LegoBaseplate.tsx`
- Create: `src/components/city/StreetTile.tsx`
- Modify: `src/components/Scene.tsx`

**Step 1: Build the LEGO baseplate component (grass tiles)**

Create `src/components/city/LegoBaseplate.tsx`:

```typescript
'use client';

import { useMemo } from 'react';
import * as THREE from 'three';

interface Props {
  position: [number, number, number];
  size: number;
  color?: string;
}

export default function LegoBaseplate({ position, size, color = '#B8D4A3' }: Props) {
  // Create studs (small cylinders on top of the plate)
  const studPositions = useMemo(() => {
    const positions: [number, number, number][] = [];
    const studSpacing = size / 5;
    const offset = -size / 2 + studSpacing / 2;
    for (let x = 0; x < 5; x++) {
      for (let z = 0; z < 5; z++) {
        positions.push([
          offset + x * studSpacing,
          0.15,
          offset + z * studSpacing,
        ]);
      }
    }
    return positions;
  }, [size]);

  const studRadius = size / 18;
  const studHeight = 0.12;

  return (
    <group position={position}>
      {/* Base plate */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[size - 0.05, 0.25, size - 0.05]} />
        <meshStandardMaterial color={color} flatShading />
      </mesh>

      {/* Studs */}
      {studPositions.map((pos, i) => (
        <mesh key={i} position={pos}>
          <cylinderGeometry args={[studRadius, studRadius, studHeight, 8]} />
          <meshStandardMaterial color={color} flatShading />
        </mesh>
      ))}
    </group>
  );
}
```

**Step 2: Build the street tile component**

Create `src/components/city/StreetTile.tsx`:

```typescript
'use client';

import { CellType } from '@/types/city';

interface Props {
  position: [number, number, number];
  size: number;
  type: CellType; // 'street-h' | 'street-v' | 'intersection'
}

export default function StreetTile({ position, size, type }: Props) {
  const lineWidth = size * 0.04;
  const lineLength = size * 0.9;

  return (
    <group position={position}>
      {/* Road surface */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[size - 0.05, 0.15, size - 0.05]} />
        <meshStandardMaterial color="#8B8B8B" flatShading />
      </mesh>

      {/* Yellow center line */}
      {type === 'street-h' && (
        <mesh position={[0, 0.09, 0]}>
          <boxGeometry args={[lineLength, 0.02, lineWidth]} />
          <meshStandardMaterial color="#F5C542" />
        </mesh>
      )}
      {type === 'street-v' && (
        <mesh position={[0, 0.09, 0]}>
          <boxGeometry args={[lineWidth, 0.02, lineLength]} />
          <meshStandardMaterial color="#F5C542" />
        </mesh>
      )}

      {/* Crosswalk stripes at intersections */}
      {type === 'intersection' && (
        <>
          {/* Horizontal stripes */}
          {Array.from({ length: 5 }).map((_, i) => (
            <mesh
              key={`cw-${i}`}
              position={[
                -size * 0.3 + i * size * 0.15,
                0.09,
                size * 0.4,
              ]}
            >
              <boxGeometry args={[size * 0.08, 0.02, size * 0.15]} />
              <meshStandardMaterial color="#EEEEEE" />
            </mesh>
          ))}
          {/* Vertical stripes */}
          {Array.from({ length: 5 }).map((_, i) => (
            <mesh
              key={`cv-${i}`}
              position={[
                size * 0.4,
                0.09,
                -size * 0.3 + i * size * 0.15,
              ]}
            >
              <boxGeometry args={[size * 0.15, 0.02, size * 0.08]} />
              <meshStandardMaterial color="#EEEEEE" />
            </mesh>
          ))}
        </>
      )}
    </group>
  );
}
```

**Step 3: Create the Ground component that renders the full grid**

Create `src/components/city/Ground.tsx`:

```typescript
'use client';

import { CityGrid } from '@/types/city';
import LegoBaseplate from './LegoBaseplate';
import StreetTile from './StreetTile';

interface Props {
  grid: CityGrid;
}

export default function Ground({ grid }: Props) {
  const { cells, cellSize } = grid;
  // Center the grid
  const offsetX = -(grid.cols * cellSize) / 2 + cellSize / 2;
  const offsetZ = -(grid.rows * cellSize) / 2 + cellSize / 2;

  return (
    <group>
      {cells.flatMap((row, r) =>
        row.map((cell, c) => {
          const x = offsetX + c * cellSize;
          const z = offsetZ + r * cellSize;
          const pos: [number, number, number] = [x, 0, z];

          if (
            cell.type === 'street-h' ||
            cell.type === 'street-v' ||
            cell.type === 'intersection'
          ) {
            return (
              <StreetTile
                key={`${r}-${c}`}
                position={pos}
                size={cellSize}
                type={cell.type}
              />
            );
          }

          // Grass, building plots, and parks all get baseplates
          const color =
            cell.type === 'park' ? '#A3C9A8' :
            cell.type === 'building' ? '#C5DCBA' :
            '#B8D4A3';

          return (
            <LegoBaseplate
              key={`${r}-${c}`}
              position={pos}
              size={cellSize}
              color={color}
            />
          );
        })
      )}
    </group>
  );
}
```

**Step 4: Wire ground into the Scene**

Update `src/components/Scene.tsx`:

```typescript
'use client';

import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrthographicCamera, MapControls } from '@react-three/drei';
import { buildCityGrid } from '@/data/cityGrid';
import Ground from './city/Ground';

export default function Scene() {
  const grid = useMemo(() => buildCityGrid(), []);

  return (
    <Canvas
      style={{ width: '100vw', height: '100vh', background: '#F5E6D3' }}
      gl={{ antialias: true }}
    >
      <OrthographicCamera
        makeDefault
        zoom={50}
        position={[20, 20, 20]}
        near={0.1}
        far={1000}
      />
      <MapControls
        enableRotate={false}
        minZoom={20}
        maxZoom={120}
        screenSpacePanning
      />
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 20, 10]} intensity={0.8} castShadow />
      <Ground grid={grid} />
    </Canvas>
  );
}
```

**Step 5: Verify — 10×10 grid of baseplates and streets visible**

Run `npm run dev`. Should see a grid with green LEGO baseplates (with studs), gray streets with yellow center lines, and crosswalks at intersections.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: render city grid with LEGO baseplates, streets, and crosswalks"
```

---

## Phase 3: LEGO Buildings

### Task 4: Build the Voxel Building Component

**Files:**
- Create: `src/components/city/LegoBuilding.tsx`
- Create: `src/lib/buildingColors.ts`

**Step 1: Define the building color palettes**

Create `src/lib/buildingColors.ts`:

```typescript
// Pastel palette inspired by town.ceo screenshot
export interface BuildingPalette {
  walls: string;
  trim: string;       // horizontal lines between floors
  roof: string;       // cylinder studs on top
  base: string;       // bottom floor accent
}

export const PALETTES: BuildingPalette[] = [
  // Purple tower (like in screenshot)
  { walls: '#B088C9', trim: '#E87461', roof: '#2D4A3E', base: '#E8C84A' },
  // Coral/salmon building
  { walls: '#E8917A', trim: '#E8C84A', roof: '#2D4A3E', base: '#D4735E' },
  // Mint building
  { walls: '#7EC8A0', trim: '#F5C542', roof: '#2D4A3E', base: '#5AAD7A' },
  // Peach building
  { walls: '#F5C09D', trim: '#E87461', roof: '#4A6B5D', base: '#E8A67A' },
  // Lavender building
  { walls: '#A78BBE', trim: '#E8C84A', roof: '#2D4A3E', base: '#8B6BA3' },
  // Sky blue building
  { walls: '#7AB8D4', trim: '#F5C542', roof: '#2D4A3E', base: '#5A9AB4' },
  // Warm yellow building
  { walls: '#E8D06A', trim: '#E87461', roof: '#4A6B5D', base: '#D4B84A' },
  // Rose building
  { walls: '#D4869A', trim: '#E8C84A', roof: '#2D4A3E', base: '#B86A7E' },
];

export function getPalette(index: number): BuildingPalette {
  return PALETTES[index % PALETTES.length];
}
```

**Step 2: Create the LEGO building component**

Create `src/components/city/LegoBuilding.tsx`:

```typescript
'use client';

import { useMemo, useState, useRef } from 'react';
import { Building } from '@/types/city';
import { getPalette } from '@/lib/buildingColors';
import * as THREE from 'three';

interface Props {
  building: Building;
  position: [number, number, number];
  cellSize: number;
  onHover?: (building: Building | null) => void;
  onClick?: (building: Building) => void;
}

export default function LegoBuilding({
  building,
  position,
  cellSize,
  onHover,
  onClick,
}: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);

  const palette = useMemo(() => getPalette(
    building.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  ), [building.id]);

  const floorHeight = 0.6;
  const trimHeight = 0.08;
  const buildingWidth = cellSize * 0.75;
  const totalHeight = building.height * floorHeight;

  // Studs on top of the building
  const roofStuds = useMemo(() => {
    const studs: [number, number, number][] = [];
    const count = building.style === 'wide' ? 3 : 2;
    const spacing = buildingWidth / (count + 1);
    for (let x = 0; x < count; x++) {
      for (let z = 0; z < count; z++) {
        studs.push([
          -buildingWidth / 2 + spacing * (x + 1),
          totalHeight + 0.2,
          -buildingWidth / 2 + spacing * (z + 1),
        ]);
      }
    }
    return studs;
  }, [building.style, buildingWidth, totalHeight]);

  const handlePointerEnter = () => {
    setHovered(true);
    onHover?.(building);
    document.body.style.cursor = 'pointer';
  };

  const handlePointerLeave = () => {
    setHovered(false);
    onHover?.(null);
    document.body.style.cursor = 'default';
  };

  return (
    <group
      ref={groupRef}
      position={position}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onClick={() => onClick?.(building)}
      scale={hovered ? 1.03 : 1}
    >
      {/* Base/foundation */}
      <mesh position={[0, 0.2, 0]}>
        <boxGeometry args={[buildingWidth + 0.1, 0.35, buildingWidth + 0.1]} />
        <meshStandardMaterial color={palette.base} flatShading />
      </mesh>

      {/* Floors */}
      {Array.from({ length: building.height }).map((_, floor) => (
        <group key={floor}>
          {/* Wall block */}
          <mesh position={[0, 0.4 + floor * floorHeight + floorHeight / 2, 0]}>
            <boxGeometry args={[buildingWidth, floorHeight - trimHeight, buildingWidth]} />
            <meshStandardMaterial color={palette.walls} flatShading />
          </mesh>
          {/* Trim line between floors */}
          <mesh position={[0, 0.4 + (floor + 1) * floorHeight, 0]}>
            <boxGeometry args={[buildingWidth + 0.05, trimHeight, buildingWidth + 0.05]} />
            <meshStandardMaterial color={palette.trim} flatShading />
          </mesh>
          {/* Window details — small inset rectangles */}
          {[-1, 1].map(side => (
            <mesh
              key={`w-${floor}-${side}`}
              position={[
                side * buildingWidth * 0.25,
                0.4 + floor * floorHeight + floorHeight / 2,
                buildingWidth / 2 + 0.01,
              ]}
            >
              <boxGeometry args={[buildingWidth * 0.18, floorHeight * 0.4, 0.02]} />
              <meshStandardMaterial color={palette.trim} flatShading />
            </mesh>
          ))}
        </group>
      ))}

      {/* Roof studs (LEGO cylinders) */}
      {roofStuds.map((pos, i) => (
        <mesh key={`stud-${i}`} position={pos}>
          <cylinderGeometry args={[buildingWidth * 0.15, buildingWidth * 0.15, 0.35, 8]} />
          <meshStandardMaterial color={palette.roof} flatShading />
        </mesh>
      ))}

      {/* Golden decorative elements on some studs */}
      {roofStuds.filter((_, i) => i % 2 === 0).map((pos, i) => (
        <mesh key={`gold-${i}`} position={[pos[0], pos[1] + 0.22, pos[2]]}>
          <cylinderGeometry args={[buildingWidth * 0.06, buildingWidth * 0.08, 0.1, 6]} />
          <meshStandardMaterial color="#E8C84A" flatShading />
        </mesh>
      ))}
    </group>
  );
}
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add LEGO building component with color palettes and floor details"
```

---

### Task 5: Place Buildings on the Grid

**Files:**
- Create: `src/components/city/Buildings.tsx`
- Modify: `src/components/Scene.tsx`

**Step 1: Create the Buildings renderer**

Create `src/components/city/Buildings.tsx`:

```typescript
'use client';

import { useCallback, useState } from 'react';
import { CityGrid, Building } from '@/types/city';
import LegoBuilding from './LegoBuilding';

interface Props {
  grid: CityGrid;
  onBuildingHover?: (building: Building | null, screenPos?: { x: number; y: number }) => void;
}

export default function Buildings({ grid, onBuildingHover }: Props) {
  const { cells, cellSize, rows, cols } = grid;
  const offsetX = -(cols * cellSize) / 2 + cellSize / 2;
  const offsetZ = -(rows * cellSize) / 2 + cellSize / 2;

  const buildings = cells.flatMap(row =>
    row.filter(cell => cell.building).map(cell => cell.building!)
  );

  const handleHover = useCallback(
    (building: Building | null) => {
      onBuildingHover?.(building);
    },
    [onBuildingHover]
  );

  return (
    <group>
      {buildings.map(building => {
        const x = offsetX + building.position.col * cellSize;
        const z = offsetZ + building.position.row * cellSize;

        return (
          <LegoBuilding
            key={building.id}
            building={building}
            position={[x, 0.12, z]}
            cellSize={cellSize}
            onHover={handleHover}
          />
        );
      })}
    </group>
  );
}
```

**Step 2: Add Buildings to Scene**

Update `src/components/Scene.tsx` — add to imports:

```typescript
import Buildings from './city/Buildings';
```

Add `<Buildings grid={grid} />` right after `<Ground grid={grid} />` in the Canvas.

Full updated Scene:

```typescript
'use client';

import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrthographicCamera, MapControls } from '@react-three/drei';
import { buildCityGrid } from '@/data/cityGrid';
import Ground from './city/Ground';
import Buildings from './city/Buildings';

export default function Scene() {
  const grid = useMemo(() => buildCityGrid(), []);

  return (
    <Canvas
      style={{ width: '100vw', height: '100vh', background: '#F5E6D3' }}
      gl={{ antialias: true }}
    >
      <OrthographicCamera
        makeDefault
        zoom={50}
        position={[20, 20, 20]}
        near={0.1}
        far={1000}
      />
      <MapControls
        enableRotate={false}
        minZoom={20}
        maxZoom={120}
        screenSpacePanning
      />
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 20, 10]} intensity={0.8} castShadow />
      <Ground grid={grid} />
      <Buildings grid={grid} />
    </Canvas>
  );
}
```

**Step 3: Verify — colorful LEGO buildings rise from the grid**

Run `npm run dev`. Should see multi-colored, multi-story LEGO buildings placed on the grid. They should have visible floors, trim lines, roof studs, and a base.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: place LEGO buildings on the city grid"
```

---

## Phase 4: Decorations

### Task 6: Trees, Benches, Lampposts, and Cars

**Files:**
- Create: `src/components/city/decorations/Tree.tsx`
- Create: `src/components/city/decorations/Bench.tsx`
- Create: `src/components/city/decorations/Lamppost.tsx`
- Create: `src/components/city/decorations/Car.tsx`
- Create: `src/components/city/Decorations.tsx`
- Modify: `src/components/Scene.tsx`

**Step 1: Tree component (lollipop style)**

Create `src/components/city/decorations/Tree.tsx`:

```typescript
'use client';

interface Props {
  position: [number, number, number];
}

export default function Tree({ position }: Props) {
  return (
    <group position={position}>
      {/* Trunk */}
      <mesh position={[0, 0.4, 0]}>
        <cylinderGeometry args={[0.06, 0.08, 0.5, 6]} />
        <meshStandardMaterial color="#8B6E4E" flatShading />
      </mesh>
      {/* Canopy — sphere */}
      <mesh position={[0, 0.8, 0]}>
        <sphereGeometry args={[0.35, 8, 6]} />
        <meshStandardMaterial color="#6BA368" flatShading />
      </mesh>
    </group>
  );
}
```

**Step 2: Bench component**

Create `src/components/city/decorations/Bench.tsx`:

```typescript
'use client';

interface Props {
  position: [number, number, number];
}

export default function Bench({ position }: Props) {
  return (
    <group position={position}>
      {/* Seat */}
      <mesh position={[0, 0.25, 0]}>
        <boxGeometry args={[0.5, 0.06, 0.2]} />
        <meshStandardMaterial color="#A0714F" flatShading />
      </mesh>
      {/* Back rest */}
      <mesh position={[0, 0.35, -0.08]}>
        <boxGeometry args={[0.5, 0.15, 0.04]} />
        <meshStandardMaterial color="#A0714F" flatShading />
      </mesh>
      {/* Legs */}
      {[-0.18, 0.18].map((x, i) => (
        <mesh key={i} position={[x, 0.13, 0]}>
          <boxGeometry args={[0.04, 0.2, 0.18]} />
          <meshStandardMaterial color="#6B4E35" flatShading />
        </mesh>
      ))}
    </group>
  );
}
```

**Step 3: Lamppost component**

Create `src/components/city/decorations/Lamppost.tsx`:

```typescript
'use client';

interface Props {
  position: [number, number, number];
}

export default function Lamppost({ position }: Props) {
  return (
    <group position={position}>
      {/* Pole */}
      <mesh position={[0, 0.6, 0]}>
        <cylinderGeometry args={[0.03, 0.04, 1.1, 6]} />
        <meshStandardMaterial color="#3A3A3A" flatShading />
      </mesh>
      {/* Arm */}
      <mesh position={[0.15, 1.1, 0]} rotation={[0, 0, -0.5]}>
        <cylinderGeometry args={[0.02, 0.02, 0.35, 4]} />
        <meshStandardMaterial color="#3A3A3A" flatShading />
      </mesh>
      {/* Lamp */}
      <mesh position={[0.28, 1.15, 0]}>
        <sphereGeometry args={[0.08, 6, 4]} />
        <meshStandardMaterial color="#F5E6A3" emissive="#F5E6A3" emissiveIntensity={0.3} flatShading />
      </mesh>
      {/* Base */}
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 0.08, 6]} />
        <meshStandardMaterial color="#3A3A3A" flatShading />
      </mesh>
    </group>
  );
}
```

**Step 4: Car component**

Create `src/components/city/decorations/Car.tsx`:

```typescript
'use client';

interface Props {
  position: [number, number, number];
  color?: string;
  rotation?: number;
}

export default function Car({ position, color = '#E87461', rotation = 0 }: Props) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Body */}
      <mesh position={[0, 0.15, 0]}>
        <boxGeometry args={[0.7, 0.2, 0.35]} />
        <meshStandardMaterial color={color} flatShading />
      </mesh>
      {/* Cabin */}
      <mesh position={[0.05, 0.3, 0]}>
        <boxGeometry args={[0.35, 0.15, 0.3]} />
        <meshStandardMaterial color={color} flatShading />
      </mesh>
      {/* Wheels */}
      {[[-0.2, 0.05, 0.18], [-0.2, 0.05, -0.18], [0.2, 0.05, 0.18], [0.2, 0.05, -0.18]].map(
        ([x, y, z], i) => (
          <mesh key={i} position={[x, y, z]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.06, 0.06, 0.05, 6]} />
            <meshStandardMaterial color="#2A2A2A" flatShading />
          </mesh>
        )
      )}
    </group>
  );
}
```

**Step 5: Decorations placement component**

Create `src/components/city/Decorations.tsx`:

```typescript
'use client';

import { CityGrid, DecorationKind } from '@/types/city';
import Tree from './decorations/Tree';
import Bench from './decorations/Bench';
import Lamppost from './decorations/Lamppost';
import Car from './decorations/Car';

interface Props {
  grid: CityGrid;
}

const CAR_COLORS: Record<string, string> = {
  'car-red': '#E87461',
  'car-blue': '#5B8BD4',
  'car-orange': '#E8A84A',
};

export default function Decorations({ grid }: Props) {
  const { cells, cellSize, rows, cols } = grid;
  const offsetX = -(cols * cellSize) / 2 + cellSize / 2;
  const offsetZ = -(rows * cellSize) / 2 + cellSize / 2;

  const items: JSX.Element[] = [];

  cells.forEach((row, r) =>
    row.forEach((cell, c) => {
      if (!cell.decoration) return;

      const baseX = offsetX + c * cellSize;
      const baseZ = offsetZ + r * cellSize;

      cell.decoration.forEach((deco, di) => {
        // Offset each decoration within the cell
        const jitter = (di * 0.7) - (cell.decoration!.length * 0.35) + 0.35;
        const x = baseX + jitter * 0.5;
        const z = baseZ + jitter * 0.3;
        const key = `${r}-${c}-${di}`;

        switch (deco) {
          case 'tree':
            items.push(<Tree key={key} position={[x, 0.12, z]} />);
            break;
          case 'bench':
            items.push(<Bench key={key} position={[x, 0.12, z]} />);
            break;
          case 'lamppost':
            items.push(<Lamppost key={key} position={[x, 0.08, z]} />);
            break;
          case 'car-red':
          case 'car-blue':
          case 'car-orange':
            const isVertical = cell.type === 'street-v';
            items.push(
              <Car
                key={key}
                position={[x, 0.08, z]}
                color={CAR_COLORS[deco]}
                rotation={isVertical ? Math.PI / 2 : 0}
              />
            );
            break;
        }
      });
    })
  );

  return <group>{items}</group>;
}
```

**Step 6: Add Decorations to Scene**

Add to `src/components/Scene.tsx` imports:

```typescript
import Decorations from './city/Decorations';
```

Add `<Decorations grid={grid} />` after `<Buildings grid={grid} />`.

**Step 7: Verify — trees, benches, lampposts, and cars visible on the map**

Run `npm run dev`. The city should now be alive with decorative elements scattered on grass tiles and streets.

**Step 8: Commit**

```bash
git add -A
git commit -m "feat: add trees, benches, lampposts, and cars as city decorations"
```

---

## Phase 5: Interactive Project Cards (HTML Overlays)

### Task 7: Hover Cards with Project Info

**Files:**
- Create: `src/components/ui/ProjectCard.tsx`
- Create: `src/components/city/InteractiveBuilding.tsx`
- Modify: `src/components/city/LegoBuilding.tsx`
- Modify: `src/components/city/Buildings.tsx`
- Modify: `src/components/Scene.tsx`

**Step 1: Build the HTML overlay project card**

Create `src/components/ui/ProjectCard.tsx`:

```typescript
'use client';

import { Project } from '@/types/city';

interface Props {
  project: Project;
}

export default function ProjectCard({ project }: Props) {
  return (
    <div
      className="pointer-events-none select-none"
      style={{ transform: 'translateY(-20px)' }}
    >
      <div className="bg-white rounded-xl shadow-lg px-4 py-3 min-w-[180px] border border-gray-100">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
            style={{ backgroundColor: project.avatarBgColor || '#4F46E5' }}
          >
            {project.avatarText || project.name.slice(0, 2).toUpperCase()}
          </div>
          {/* Info */}
          <div>
            <div className="font-semibold text-gray-900 text-sm leading-tight">
              {project.name}
            </div>
            <div className="text-[11px] text-gray-400 font-medium tracking-wide uppercase mt-0.5">
              {project.commits} COMMIT{project.commits !== 1 ? 'S' : ''}
            </div>
          </div>
        </div>
      </div>
      {/* Arrow */}
      <div className="flex justify-center">
        <div className="w-3 h-3 bg-white rotate-45 -mt-1.5 border-r border-b border-gray-100" />
      </div>
    </div>
  );
}
```

**Step 2: Create InteractiveBuilding wrapper that shows HTML overlay**

Create `src/components/city/InteractiveBuilding.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { Html } from '@react-three/drei';
import { Building } from '@/types/city';
import LegoBuilding from './LegoBuilding';
import ProjectCard from '../ui/ProjectCard';

interface Props {
  building: Building;
  position: [number, number, number];
  cellSize: number;
}

export default function InteractiveBuilding({ building, position, cellSize }: Props) {
  const [hovered, setHovered] = useState(false);

  const floorHeight = 0.6;
  const cardY = 0.4 + building.height * floorHeight + 1.0;

  return (
    <group>
      <LegoBuilding
        building={building}
        position={position}
        cellSize={cellSize}
        onHover={(b) => setHovered(!!b)}
      />
      {/* HTML overlay card */}
      {hovered && building.project && (
        <Html
          position={[position[0], cardY, position[2]]}
          center
          distanceFactor={10}
          style={{ pointerEvents: 'none' }}
        >
          <ProjectCard project={building.project} />
        </Html>
      )}
    </group>
  );
}
```

**Step 3: Update Buildings to use InteractiveBuilding**

Replace `src/components/city/Buildings.tsx`:

```typescript
'use client';

import { CityGrid } from '@/types/city';
import InteractiveBuilding from './InteractiveBuilding';

interface Props {
  grid: CityGrid;
}

export default function Buildings({ grid }: Props) {
  const { cells, cellSize, rows, cols } = grid;
  const offsetX = -(cols * cellSize) / 2 + cellSize / 2;
  const offsetZ = -(rows * cellSize) / 2 + cellSize / 2;

  const buildings = cells.flatMap(row =>
    row.filter(cell => cell.building).map(cell => cell.building!)
  );

  return (
    <group>
      {buildings.map(building => {
        const x = offsetX + building.position.col * cellSize;
        const z = offsetZ + building.position.row * cellSize;

        return (
          <InteractiveBuilding
            key={building.id}
            building={building}
            position={[x, 0.12, z]}
            cellSize={cellSize}
          />
        );
      })}
    </group>
  );
}
```

**Step 4: Verify — hover any building to see the project card popup**

Run `npm run dev`. Hover over buildings — a white card with project name, avatar, and commit count should appear floating above the building.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add interactive hover cards with project info on buildings"
```

---

## Phase 6: Floating Badges & Final Polish

### Task 8: LGTM Badges and Ambient Details

**Files:**
- Create: `src/components/city/FloatingBadge.tsx`
- Modify: `src/components/Scene.tsx`

**Step 1: Create animated floating badges**

Create `src/components/city/FloatingBadge.tsx`:

```typescript
'use client';

import { useRef } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface Props {
  position: [number, number, number];
  text: string;
  emoji?: string;
}

export default function FloatingBadge({ position, text, emoji = '💬' }: Props) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (groupRef.current) {
      // Gentle bobbing animation
      groupRef.current.position.y =
        position[1] + Math.sin(clock.getElapsedTime() * 1.5) * 0.15;
    }
  });

  return (
    <group ref={groupRef} position={position}>
      <Html center distanceFactor={10}>
        <div className="pointer-events-none select-none">
          <div className="bg-white rounded-full shadow-md px-3 py-1.5 flex items-center gap-1.5 border border-gray-100">
            <span className="text-sm">{emoji}</span>
            <span className="text-xs font-semibold text-gray-700">{text}</span>
          </div>
        </div>
      </Html>
    </group>
  );
}
```

**Step 2: Add badges and final lighting to Scene**

Update `src/components/Scene.tsx` to its final form:

```typescript
'use client';

import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrthographicCamera, MapControls } from '@react-three/drei';
import { buildCityGrid } from '@/data/cityGrid';
import Ground from './city/Ground';
import Buildings from './city/Buildings';
import Decorations from './city/Decorations';
import FloatingBadge from './city/FloatingBadge';

export default function Scene() {
  const grid = useMemo(() => buildCityGrid(), []);

  return (
    <Canvas
      style={{ width: '100vw', height: '100vh', background: '#F5E6D3' }}
      gl={{ antialias: true }}
    >
      <OrthographicCamera
        makeDefault
        zoom={50}
        position={[20, 20, 20]}
        near={0.1}
        far={1000}
      />
      <MapControls
        enableRotate={false}
        minZoom={20}
        maxZoom={120}
        screenSpacePanning
      />

      {/* Lighting */}
      <ambientLight intensity={0.65} />
      <directionalLight position={[15, 25, 15]} intensity={0.7} castShadow />
      <directionalLight position={[-10, 15, -5]} intensity={0.2} color="#FFE4C4" />
      <hemisphereLight args={['#FFF5E6', '#C8DFC3', 0.3]} />

      {/* City */}
      <Ground grid={grid} />
      <Buildings grid={grid} />
      <Decorations grid={grid} />

      {/* Floating badges */}
      <FloatingBadge position={[-12, 3, -8]} text="LGTM" emoji="💬" />
      <FloatingBadge position={[8, 4, 5]} text="Ship it!" emoji="🚀" />
      <FloatingBadge position={[-5, 2.5, 10]} text="Nice!" emoji="⭐" />
    </Canvas>
  );
}
```

**Step 3: Update the page with edge decorations**

Update `src/app/page.tsx`:

```typescript
import dynamic from 'next/dynamic';

const Scene = dynamic(() => import('@/components/Scene'), { ssr: false });

export default function Home() {
  return (
    <main className="w-screen h-screen overflow-hidden relative">
      <Scene />

      {/* Decorative diagonal stripes on right edge (like screenshot) */}
      <div className="absolute top-0 right-0 w-16 h-full pointer-events-none overflow-hidden">
        <div
          className="w-full h-full"
          style={{
            background: 'repeating-linear-gradient(45deg, #222 0px, #222 12px, #fff 12px, #fff 24px)',
            opacity: 0.8,
          }}
        />
      </div>
    </main>
  );
}
```

**Step 4: Verify full scene**

Run `npm run dev`. The complete city should render with:
- ✅ Green LEGO baseplates with studs
- ✅ Gray streets with yellow center lines and crosswalks
- ✅ Colorful multi-story LEGO buildings with trim, windows, and roof studs
- ✅ Trees, benches, lampposts, and cars scattered around
- ✅ Hover cards on buildings showing project name + commits
- ✅ Floating "LGTM" / "Ship it!" / "Nice!" badges bobbing gently
- ✅ Warm peach background, diagonal stripe edge decoration
- ✅ Pan and zoom controls

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add floating badges, final lighting, and edge decorations"
```

---

## Phase 7: Performance & Instanced Rendering (Optional)

### Task 9: Optimize with Instanced Meshes

**Files:**
- Modify: `src/components/city/LegoBaseplate.tsx`

If performance is an issue with many studs, convert stud rendering to `InstancedMesh`. This task is optional — skip if FPS is fine.

**Step 1: Profile in dev tools**

Open Chrome DevTools → Performance tab → record 5 seconds of panning.
If FPS stays above 50, skip this task.

**Step 2: If needed, replace individual stud meshes with InstancedMesh**

Replace the studs section in `LegoBaseplate.tsx` with:

```typescript
import { useRef, useEffect } from 'react';
import * as THREE from 'three';

// Inside the component, replace the studs map with:
const meshRef = useRef<THREE.InstancedMesh>(null);

useEffect(() => {
  if (!meshRef.current) return;
  const dummy = new THREE.Object3D();
  studPositions.forEach(([x, y, z], i) => {
    dummy.position.set(x, y, z);
    dummy.updateMatrix();
    meshRef.current!.setMatrixAt(i, dummy.matrix);
  });
  meshRef.current.instanceMatrix.needsUpdate = true;
}, [studPositions]);

// Replace the stud JSX with:
<instancedMesh ref={meshRef} args={[undefined, undefined, studPositions.length]}>
  <cylinderGeometry args={[studRadius, studRadius, studHeight, 8]} />
  <meshStandardMaterial color={color} flatShading />
</instancedMesh>
```

**Step 3: Commit**

```bash
git add -A
git commit -m "perf: use instanced meshes for LEGO studs"
```

---

## Summary

| Phase | What it delivers |
|-------|-----------------|
| 1 | Project scaffold + basic 3D scene |
| 2 | LEGO baseplates + streets + crosswalks |
| 3 | Voxel buildings with palettes + floor details |
| 4 | Trees, benches, lampposts, cars |
| 5 | Interactive hover cards with project info |
| 6 | Floating badges + polish + edge decorations |
| 7 | Performance optimization (optional) |

Total: **9 tasks**, ~45–60 minutes of implementation time.
