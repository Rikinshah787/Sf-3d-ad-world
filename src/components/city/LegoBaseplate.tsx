'use client';

import { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';

interface Props {
  position: [number, number, number];
  size: number;
  color?: string;
}

export default function LegoBaseplate({ position, size, color = '#B8D4A3' }: Props) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  // 3x3 studs instead of 5x5 — way fewer meshes
  const studData = useMemo(() => {
    const count = 3;
    const positions: [number, number, number][] = [];
    const spacing = size / (count + 1);
    for (let x = 0; x < count; x++) {
      for (let z = 0; z < count; z++) {
        positions.push([
          -size / 2 + spacing * (x + 1),
          0.15,
          -size / 2 + spacing * (z + 1),
        ]);
      }
    }
    return positions;
  }, [size]);

  useEffect(() => {
    if (!meshRef.current) return;
    const dummy = new THREE.Object3D();
    studData.forEach(([x, y, z], i) => {
      dummy.position.set(x, y, z);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [studData]);

  const studRadius = size / 16;

  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[size - 0.05, 0.25, size - 0.05]} />
        <meshStandardMaterial color={color} flatShading />
      </mesh>
      <instancedMesh ref={meshRef} args={[undefined, undefined, studData.length]}>
        <cylinderGeometry args={[studRadius, studRadius, 0.12, 6]} />
        <meshStandardMaterial color={color} flatShading />
      </instancedMesh>
    </group>
  );
}
