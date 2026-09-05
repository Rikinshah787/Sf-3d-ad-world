'use client';

import { CellType } from '@/types/city';

interface Props {
  position: [number, number, number];
  size: number;
  type: CellType;
}

export default function StreetTile({ position, size, type }: Props) {
  const lineWidth = size * 0.04;
  const lineLength = size * 0.9;

  return (
    <group position={position}>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[size - 0.05, 0.15, size - 0.05]} />
        <meshStandardMaterial color="#8B8B8B" flatShading />
      </mesh>

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

      {type === 'intersection' && (
        <>
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
