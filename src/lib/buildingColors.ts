export interface BuildingPalette {
  walls: string;
  trim: string;
  roof: string;
  base: string;
}

export const PALETTES: BuildingPalette[] = [
  { walls: '#B088C9', trim: '#E87461', roof: '#2D4A3E', base: '#E8C84A' },
  { walls: '#E8917A', trim: '#E8C84A', roof: '#2D4A3E', base: '#D4735E' },
  { walls: '#7EC8A0', trim: '#F5C542', roof: '#2D4A3E', base: '#5AAD7A' },
  { walls: '#F5C09D', trim: '#E87461', roof: '#4A6B5D', base: '#E8A67A' },
  { walls: '#A78BBE', trim: '#E8C84A', roof: '#2D4A3E', base: '#8B6BA3' },
  { walls: '#7AB8D4', trim: '#F5C542', roof: '#2D4A3E', base: '#5A9AB4' },
  { walls: '#E8D06A', trim: '#E87461', roof: '#4A6B5D', base: '#D4B84A' },
  { walls: '#D4869A', trim: '#E8C84A', roof: '#2D4A3E', base: '#B86A7E' },
];

export function getPalette(index: number): BuildingPalette {
  return PALETTES[index % PALETTES.length];
}
