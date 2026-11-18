import { houseForLevel } from './catalog';

/** Shared visible materials for the home perimeter and battle defense line. */
export interface FortressPalette {
  readonly base: string;
  readonly shadow: string;
  readonly highlight: string;
  readonly trim: string;
  readonly reinforcement: string;
  readonly accent: string;
}

const PALETTES: readonly FortressPalette[] = [
  { base: '#805c40', shadow: '#6f4d36', highlight: '#c39b6e', trim: '#bd8253', reinforcement: '#ad8157', accent: '#e1bc69' },
  { base: '#805c40', shadow: '#6f4d36', highlight: '#c39b6e', trim: '#bd8253', reinforcement: '#ad8157', accent: '#e1bc69' },
  { base: '#9ab1ad', shadow: '#718c8c', highlight: '#c5d1c6', trim: '#d0d7c6', reinforcement: '#b0c2bb', accent: '#a4b7af' },
  { base: '#96aaa7', shadow: '#718c8c', highlight: '#b4c6bf', trim: '#ced5c8', reinforcement: '#9caaa5', accent: '#a4b7af' },
  { base: '#617e87', shadow: '#435d60', highlight: '#78949b', trim: '#d4b15f', reinforcement: '#597582', accent: '#d0ad61' },
];

export function fortressPalette(level: number): FortressPalette {
  houseForLevel(level);
  return PALETTES[level - 1];
}
