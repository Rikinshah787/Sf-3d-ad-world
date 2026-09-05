import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrthographicCamera, MapControls } from "@react-three/drei";
import Ground from "./city/Ground";
import SpotBuilding from "./city/SpotBuilding";
import Decorations from "./city/Decorations";
import { buildGridLayout } from "@/lib/gridLayout";

interface Spot {
  _id: string;
  name: string;
  neighborhood: string;
  gridRow: number;
  gridCol: number;
  buildingHeight: number;
  buildingStyle: "tower" | "wide" | "skyscraper" | "small";
  currentBid: number;
  highestBidder?: string;
  color?: string;
}

interface Props {
  spots: Spot[];
  onSpotClick: (spot: Spot) => void;
}

function City({ spots, onSpotClick }: Props) {
  const grid = useMemo(() => buildGridLayout(), []);
  const cellSize = 4;
  const offsetX = -(10 * cellSize) / 2 + cellSize / 2;
  const offsetZ = -(10 * cellSize) / 2 + cellSize / 2;

  return (
    <>
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

      <ambientLight intensity={0.7} />
      <directionalLight position={[15, 25, 15]} intensity={0.8} />
      <directionalLight position={[-10, 15, -5]} intensity={0.3} color="#FFE4C4" />

      <Ground grid={grid} />

      {spots.map((spot) => (
        <SpotBuilding
          key={spot._id}
          spot={spot}
          position={[
            offsetX + spot.gridCol * cellSize,
            0.12,
            offsetZ + spot.gridRow * cellSize,
          ]}
          cellSize={cellSize}
          onClick={() => onSpotClick(spot)}
        />
      ))}

      <Decorations grid={grid} />
    </>
  );
}

export default function CityScene({ spots, onSpotClick }: Props) {
  return (
    <div style={{ width: "100%", height: "100%", background: "#F5E6D3" }}>
      <Canvas
        gl={{ antialias: true, alpha: false }}
        onCreated={({ gl }) => gl.setClearColor("#F5E6D3")}
      >
        <Suspense fallback={null}>
          <City spots={spots} onSpotClick={onSpotClick} />
        </Suspense>
      </Canvas>
    </div>
  );
}
