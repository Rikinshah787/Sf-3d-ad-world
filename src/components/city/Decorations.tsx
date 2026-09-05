import { GridLayout } from "@/lib/gridLayout";
import Tree from "./decorations/Tree";
import Lamppost from "./decorations/Lamppost";
import Car from "./decorations/Car";

interface Props {
  grid: GridLayout;
}

export default function Decorations({ grid }: Props) {
  const { cells, cellSize, rows, cols } = grid;
  const offsetX = -(cols * cellSize) / 2 + cellSize / 2;
  const offsetZ = -(rows * cellSize) / 2 + cellSize / 2;

  const items: JSX.Element[] = [];

  cells.forEach((row, r) =>
    row.forEach((cell, c) => {
      if (!cell.decoration) return;
      const x = offsetX + c * cellSize;
      const z = offsetZ + r * cellSize;

      cell.decoration.forEach((deco, di) => {
        const key = `${r}-${c}-${di}`;
        switch (deco) {
          case "tree":
            items.push(<Tree key={key} position={[x, 0.12, z]} />);
            break;
          case "lamppost":
            items.push(<Lamppost key={key} position={[x, 0.08, z]} />);
            break;
          case "car-red":
            items.push(
              <Car key={key} position={[x, 0.08, z]}
                rotation={cell.type === "street-v" ? Math.PI / 2 : 0} />
            );
            break;
        }
      });
    })
  );

  return <group>{items}</group>;
}
