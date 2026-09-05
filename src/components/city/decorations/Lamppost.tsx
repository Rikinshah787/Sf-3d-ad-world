'use client';

interface Props {
  position: [number, number, number];
}

export default function Lamppost({ position }: Props) {
  return (
    <group position={position}>
      <mesh position={[0, 0.6, 0]}>
        <cylinderGeometry args={[0.03, 0.04, 1.1, 6]} />
        <meshStandardMaterial color="#3A3A3A" flatShading />
      </mesh>
      <mesh position={[0.15, 1.1, 0]} rotation={[0, 0, -0.5]}>
        <cylinderGeometry args={[0.02, 0.02, 0.35, 4]} />
        <meshStandardMaterial color="#3A3A3A" flatShading />
      </mesh>
      <mesh position={[0.28, 1.15, 0]}>
        <sphereGeometry args={[0.08, 6, 4]} />
        <meshStandardMaterial color="#F5E6A3" emissive="#F5E6A3" emissiveIntensity={0.3} flatShading />
      </mesh>
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 0.08, 6]} />
        <meshStandardMaterial color="#3A3A3A" flatShading />
      </mesh>
    </group>
  );
}
