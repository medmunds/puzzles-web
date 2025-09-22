import catalog from "../assets/puzzles/catalog.json";

export interface PuzzleDataMap {
  [id: string]: PuzzleData;
}

export interface PuzzleData {
  name: string;
  description: string;
  objective: string;
  unfinished?: boolean;
}

export const version: string = catalog.version;
export const puzzleDataMap: Readonly<PuzzleDataMap> = catalog.puzzles;
