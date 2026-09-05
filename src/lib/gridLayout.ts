export type CellType = "grass" | "street-h" | "street-v" | "intersection" | "building" | "park";

export type DecorationKind = "tree" | "lamppost" | "car-red";

export interface GridCell {
  type: CellType;
  row: number;
  col: number;
  decoration?: DecorationKind[];
}

export interface GridLayout {
  rows: number;
  cols: number;
  cells: GridCell[][];
  cellSize: number;
}

// SF-inspired city layout
const LAYOUT: string[] = [
  "G G B X H H X B G G",
  "G G G V G G V G G G",
  "B G B V G B V B G B",
  "X H H X H H X H H X",
  "H G G V G G V G G H",
  "H G B V G P V B G H",
  "X H H X H H X H H X",
  "B G B V G B V B G B",
  "G G G V G G V G G G",
  "G G B X H H X B G G",
];

function parseCellType(ch: string): CellType {
  const map: Record<string, CellType> = {
    G: "grass", H: "street-h", V: "street-v",
    X: "intersection", B: "building", P: "park",
  };
  return map[ch] ?? "grass";
}

const rng = (seed: number) => ((seed * 9301 + 49297) % 233280) / 233280;

export function buildGridLayout(): GridLayout {
  const cells: GridCell[][] = LAYOUT.map((row, r) =>
    row.split(" ").map((ch, c) => {
      const type = parseCellType(ch);
      const cell: GridCell = { type, row: r, col: c };

      // Sparse decorations
      if (type === "park") {
        cell.decoration = ["tree"];
      } else if (type === "grass") {
        const v = rng(r * 100 + c);
        if (v < 0.15) cell.decoration = ["tree"];
        else if (v < 0.2) cell.decoration = ["lamppost"];
      } else if ((type === "street-h" || type === "street-v") && rng(r * 100 + c + 500) < 0.08) {
        cell.decoration = ["car-red"];
      }

      return cell;
    })
  );

  return { rows: 10, cols: 10, cells, cellSize: 4 };
}
