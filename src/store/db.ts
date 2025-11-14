import Dexie, { type EntityTable, type Table } from "dexie";
import type { ConfigValues, GameStatus } from "../puzzle/types.ts";

export type PuzzleId = string;
export type EncodedParams = string;

// Settings shared by all puzzles
export interface CommonSettings {
  // App level settings
  allowOfflineUse?: boolean;
  autoUpdate?: boolean;

  // Catalog-level settings
  favoritePuzzles?: PuzzleId[];
  showIntro?: boolean;
  showUnfinishedPuzzles?: boolean;

  // Preferences shared between all puzzles
  puzzlePreferences?: ConfigValues;

  // Secondary button emulation
  showMouseButtonToggle?: boolean;
  rightButtonLongPress?: boolean;
  rightButtonTwoFingerTap?: boolean;
  rightButtonAudioVolume?: number; // 0-100; 0 disables
  rightButtonHoldTime?: number; // milliseconds
  rightButtonDragThreshold?: number; // css pixel radius

  // Appearance
  showEndNotification?: boolean;
  showPuzzleKeyboard?: boolean;
  statusbarPlacement?: "start" | "end" | "hidden";
  maxScale?: number | null; // null in DB/json === Infinity in exposed value
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
  | { id: "puzzle-common"; type: "puzzle-common"; data: CommonSettings }
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
  filename: string; // user filename or autoSaveFilename
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
    this.version(2).stores({
      settings: ["id", "type"].join(", "),

      savedGames: [
        "&[puzzleId+saveType+filename]", // compound primary key
        "[saveType+puzzleId+timestamp]", // supports query by saveType, most recent
      ].join(", "),
    });
  }
}

// Singleton database instance
export const db = new Database();
