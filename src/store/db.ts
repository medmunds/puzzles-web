import Dexie, { type EntityTable, type Table } from "dexie";
import type { ConfigValues, GameStatus } from "../puzzle/types.ts";

export type PuzzleId = string;
export type EncodedParams = string;

export interface CatalogSettings {
  favorites?: PuzzleId[];
  showUnfinished?: boolean;
}

// Settings shared by all puzzles
export interface CommonPuzzleSettings {
  // Preferences shared between all puzzles
  puzzlePreferences?: ConfigValues;

  // Secondary button emulation
  rightButtonLongPress?: boolean;
  rightButtonTwoFingerTap?: boolean;
  rightButtonAudioVolume?: number; // 0-100; 0 disables
  rightButtonHoldTime?: number; // milliseconds
  rightButtonDragThreshold?: number; // css pixel radius

  maximizePuzzleSize?: number;
}

// PuzzleId-specific settings
export interface PuzzleSettings {
  puzzlePreferences?: ConfigValues;
  customPresets?: Array<{
    name: string;
    params: EncodedParams;
  }>;

  // Default params for new puzzles
  params?: EncodedParams;
}

export type SettingsRecord =
  | { id: "catalog"; type: "catalog"; data: CatalogSettings }
  | { id: "puzzle-common"; type: "puzzle-common"; data: CommonPuzzleSettings }
  | { id: PuzzleId; type: "puzzle"; data: PuzzleSettings };

export enum SaveType {
  User = 0,
  Auto = 1,
}

export const TIMESTAMP_MIN = Dexie.minKey;
export const TIMESTAMP_MAX = Dexie.maxKey;
export const PUZZLE_ID_MIN = Dexie.minKey;
export const PUZZLE_ID_MAX = Dexie.maxKey;

export interface SavedGameMetadata {
  filename: string; // user filename or autoSaveId
  puzzleId: PuzzleId;
  timestamp: number;
  status: GameStatus;
  gameId: string;
}

export interface SavedGameRecord extends SavedGameMetadata {
  saveType: SaveType; // IndexedDB can't index boolean, so use a number
  data: Blob;
  checkpoints?: readonly number[];
}

class Database extends Dexie {
  settings!: EntityTable<SettingsRecord, "id">;
  savedGames!: Table<SavedGameRecord, [PuzzleId, SaveType, string]>;

  constructor() {
    super("PuzzleAppData");
    this.version(1).stores({
      settings: ["id", "type"].join(", "),

      savedGames: [
        "&[puzzleId+saveType+filename]", // compound primary key
        "[puzzleId+saveType+timestamp]", // supports "most recent" query
      ].join(", "),
    });
  }
}

// Singleton database instance
export const db = new Database();
