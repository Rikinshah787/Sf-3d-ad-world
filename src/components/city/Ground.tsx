import { GridLayout } from "@/lib/gridLayout";
import LegoBaseplate from "./LegoBaseplate";
import StreetTile from "./StreetTile";

interface Props {
  grid: GridLayout;
}

export default function Ground({ grid }: Props) {
  const { cells, cellSize } = grid;
  const offsetX = -(grid.cols * cellSize) / 2 + cellSize / 2;
  const offsetZ = -(grid.rows * cellSize) / 2 + cellSize / 2;

  return (
    <group>
      {cells.flatMap((row, r) =>
        row.map((cell, c) => {
          const x = offsetX + c * cellSize;
          const z = offsetZ + r * cellSize;
          const pos: [number, number, number] = [x, 0, z];

          if (cell.type === "street-h" || cell.type === "street-v" || cell.type === "intersection") {
            return <StreetTile key={`${r}-${c}`} position={pos} size={cellSize} type={cell.type} />;
          }

          const color =
            cell.type === "park" ? "#A3C9A8" :
            cell.type === "building" ? "#C5DCBA" : "#B8D4A3";

          return <LegoBaseplate key={`${r}-${c}`} position={pos} size={cellSize} color={color} />;
        })
      )}
    </group>
  );
}
