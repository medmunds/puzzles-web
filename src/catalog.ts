// Typings for catalog.json

export interface CatalogData {
  puzzles: PuzzleDataMap;
  version: string;
}

export interface PuzzleDataMap {
  [id: string]: PuzzleData;
}

export interface PuzzleData {
  name: string;
  description: string;
  objective: string;
  unfinished?: boolean;
}
