import { useMemo, useState, useRef } from "react";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { getPalette } from "@/lib/buildingColors";

interface Spot {
  _id: string;
  name: string;
  neighborhood: string;
  currentBid: number;
  highestBidder?: string;
  buildingHeight: number;
  buildingStyle: "tower" | "wide" | "skyscraper" | "small";
  color?: string;
}

interface Props {
  spot: Spot;
  position: [number, number, number];
  cellSize: number;
  onClick: () => void;
}

export default function SpotBuilding({ spot, position, cellSize, onClick }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);

  const palette = useMemo(() => {
    if (spot.color) {
      return {
        walls: spot.color,
        trim: "#E87461",
        roof: "#2D4A3E",
        base: "#E8C84A",
      };
    }
    return getPalette(spot._id.split("").reduce((a, c) => a + c.charCodeAt(0), 0));
  }, [spot._id, spot.color]);

  const floorH = 0.6;
  const bw = cellSize * 0.75;
  const totalH = spot.buildingHeight * floorH;
  const trimH = 0.08;

  // 2x2 roof studs
  const roofStuds = useMemo(() => {
    const studs: [number, number, number][] = [];
    const sp = bw / 3;
    for (let x = 0; x < 2; x++)
      for (let z = 0; z < 2; z++)
        studs.push([-bw / 2 + sp * (x + 1), totalH + 0.2, -bw / 2 + sp * (z + 1)]);
    return studs;
  }, [bw, totalH]);

  return (
    <group
      ref={groupRef}
      position={position}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = "default"; }}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      scale={hovered ? 1.04 : 1}
    >
      {/* Base */}
      <mesh position={[0, 0.2, 0]}>
        <boxGeometry args={[bw + 0.1, 0.35, bw + 0.1]} />
        <meshStandardMaterial color={palette.base} flatShading />
      </mesh>

      {/* Main wall */}
      <mesh position={[0, 0.4 + totalH / 2, 0]}>
        <boxGeometry args={[bw, totalH, bw]} />
        <meshStandardMaterial color={palette.walls} flatShading />
      </mesh>

      {/* Trim lines */}
      {Array.from({ length: Math.min(spot.buildingHeight, 4) }).map((_, i) => {
        const idx = Math.floor((i / Math.min(spot.buildingHeight, 4)) * spot.buildingHeight);
        return (
          <mesh key={i} position={[0, 0.4 + (idx + 1) * floorH, 0]}>
            <boxGeometry args={[bw + 0.05, trimH, bw + 0.05]} />
            <meshStandardMaterial color={palette.trim} flatShading />
          </mesh>
        );
      })}

      {/* Roof studs */}
      {roofStuds.map((pos, i) => (
        <mesh key={i} position={pos}>
          <cylinderGeometry args={[bw * 0.14, bw * 0.14, 0.35, 6]} />
          <meshStandardMaterial color={palette.roof} flatShading />
        </mesh>
      ))}

      {/* Hover label */}
      {hovered && (
        <Html
          position={[0, totalH + 1.2, 0]}
          center
          distanceFactor={10}
          style={{ pointerEvents: "none" }}
        >
          <div style={{
            background: "#fff", borderRadius: 12, padding: "10px 16px",
            boxShadow: "0 4px 20px rgba(0,0,0,0.15)", minWidth: 160,
            fontFamily: "-apple-system, sans-serif", userSelect: "none",
          }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#111" }}>{spot.name}</div>
            <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{spot.neighborhood}</div>
            <div style={{
              marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: "#4F46E5" }}>${spot.currentBid}</span>
              <span style={{
                fontSize: 10, color: "#fff", background: "#4F46E5",
                borderRadius: 6, padding: "3px 8px", fontWeight: 600,
              }}>
                {spot.highestBidder || "No bids"}
              </span>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <div style={{
              width: 10, height: 10, background: "#fff", transform: "rotate(45deg)",
              marginTop: -5, boxShadow: "2px 2px 4px rgba(0,0,0,0.1)",
            }} />
          </div>
        </Html>
      )}
    </group>
  );
}
