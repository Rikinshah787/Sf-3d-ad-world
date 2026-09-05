'use client';

interface Props {
  position: [number, number, number];
}

export default function Tree({ position }: Props) {
  return (
    <group position={position}>
      <mesh position={[0, 0.4, 0]}>
        <cylinderGeometry args={[0.06, 0.08, 0.5, 4]} />
        <meshStandardMaterial color="#8B6E4E" flatShading />
      </mesh>
      <mesh position={[0, 0.8, 0]}>
        <sphereGeometry args={[0.35, 6, 4]} />
        <meshStandardMaterial color="#6BA368" flatShading />
      </mesh>
    </group>
  );
}
