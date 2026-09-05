'use client';

interface Props {
  position: [number, number, number];
  color?: string;
  rotation?: number;
}

export default function Car({ position, color = '#E87461', rotation = 0 }: Props) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.15, 0]}>
        <boxGeometry args={[0.7, 0.2, 0.35]} />
        <meshStandardMaterial color={color} flatShading />
      </mesh>
      <mesh position={[0.05, 0.3, 0]}>
        <boxGeometry args={[0.35, 0.15, 0.3]} />
        <meshStandardMaterial color={color} flatShading />
      </mesh>
      {([[-0.2, 0.05, 0.18], [-0.2, 0.05, -0.18], [0.2, 0.05, 0.18], [0.2, 0.05, -0.18]] as [number, number, number][]).map(
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
