import * as Sentry from "@sentry/browser";
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

  // For unfinished puzzles, timestamp when the alert was last shown
  lastUnfinishedAlert?: number;
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
  // data was originally stored as Blob; changed for Safari private browsing mode
  data: Uint8Array<ArrayBuffer> | Blob;
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

  override open() {
    // Work around Safari https://bugs.webkit.org/show_bug.cgi?id=277615 (regression
    // of 273827), which can occur when a page wakes up after being in the background.
    // Dexie attempts to reopen the DB three times, then throws DatabaseClosedError.
    // The underlying WebKit error is "Connection to Indexed Database server lost.
    // Refresh the page to try again." (https://github.com/dexie/Dexie.js/issues/2008)
    const recoveryKey = "db-page-reload-attempted";
    let hasTriedRecovery = false;
    let canUseSessionStorage = false;
    try {
      hasTriedRecovery = sessionStorage.getItem(recoveryKey) !== null;
      canUseSessionStorage = true;
    } catch {}

    if (import.meta.env.VITE_SENTRY_DSN && hasTriedRecovery) {
      Sentry.addBreadcrumb({
        category: "db",
        message: "Reloaded page due to Safari IndexedDB bug",
      });
    }

    return super.open().then(
      (result) => {
        if (hasTriedRecovery) {
          sessionStorage.removeItem(recoveryKey);
        }
        return result;
      },
      (error: unknown) => {
        if (
          error instanceof Dexie.DexieError &&
          error.name === "DatabaseClosedError" &&
          error.message.includes("Refresh the page to try again") &&
          !hasTriedRecovery &&
          canUseSessionStorage
        ) {
          // If we haven't already tried to refresh the page, refresh it.
          sessionStorage.setItem(recoveryKey, "true");
          window.location.reload();
          // Return a promise that never resolves
          // to stop execution while the page reloads
          return new Dexie.Promise<Dexie>(() => {});
        }
        return Dexie.Promise.reject(error);
      },
    );
  }
}

// Singleton database instance
export const db = new Database();
