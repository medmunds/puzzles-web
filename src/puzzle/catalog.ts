import { puzzles } from "../assets/puzzles/catalog.json";

export { puzzleIds, version } from "../assets/puzzles/catalog.json";

export interface PuzzleDataMap {
  [id: string]: PuzzleData;
}

export interface PuzzleData {
  name: string;
  description: string;
  objective: string;
  collection: string;
  unfinished?: boolean;
}

export const puzzleDataMap: Readonly<PuzzleDataMap> = puzzles;
