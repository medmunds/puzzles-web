import Dexie, { type Table } from "dexie";
import type { ConfigValues, GameStatus } from "./puzzle/types.ts";

export type PuzzleId = string;
export type EncodedParams = string;

export interface CatalogSettings {
  favorites: PuzzleId[];
  showUnfinished: boolean;
}

export interface CommonPuzzleSettings {
  puzzlePreferences: ConfigValues;
  emulateRightButton?: {
    longPress?: boolean;
    twoFingerTap?: boolean;
    secondaryButtonTimeout?: number;
    secondaryButtonSlop?: number;
  };
  maximizePuzzleSize?: number;
}

export interface PuzzleSettings {
  puzzlePreferences: ConfigValues;
  customPresets: Array<{
    name: string;
    params: EncodedParams;
  }>;
  currentParams?: number | EncodedParams;
}

export type SettingsRecord =
  | { id: "catalog"; type: "catalog"; data: CatalogSettings }
  | { id: "puzzle-common"; type: "puzzle-common"; data: CommonPuzzleSettings }
  | { id: PuzzleId; type: "puzzle"; data: PuzzleSettings };

export interface SavedGameRecord {
  id: string; // `${puzzleId}:${filename}`
  puzzleId: PuzzleId;
  filename: string; // user-chosen name or `autosave-${uuid}`
  isAutosave: boolean;
  timestamp: number;
  status: GameStatus;
  gameId: string;
  data: Blob;
}

class Database extends Dexie {
  settings!: Table<SettingsRecord>;
  savedGames!: Table<SavedGameRecord>;

  constructor() {
    super("PuzzleAppData");
    this.version(1).stores({
      settings: ["id", "type"].join(", "),

      savedGames: [
        "id",
        "puzzleId",
        "timestamp",
        "&[puzzleId+filename]", // Ensure unique filenames per puzzle
      ].join(", "),
    });
  }
}

class Store {
  private db: Database = new Database();

  delete() {
    this.db.close();
  }

  //
  // Settings
  //

  private async getCommonSettings(): Promise<CommonPuzzleSettings | undefined> {
    const record = await this.db.settings.get("puzzle-common");
    return record?.type === "puzzle-common" ? record.data : undefined;
  }

  private async getPuzzleSettings(
    puzzleId: PuzzleId,
  ): Promise<PuzzleSettings | undefined> {
    const record = await this.db.settings.get(puzzleId);
    return record?.type === "puzzle" ? record.data : undefined;
  }

  /**
   * Return all persisted puzzle preferences for puzzleId, including common
   * settings and app defaults.
   */
  async getPuzzlePreferences(puzzleId: PuzzleId): Promise<ConfigValues> {
    // TODO: move defaults to src/puzzle/augment; make puzzleId-specific
    const defaults = {
      "pencil-keep-highlight": true, // keen, solo, towers, undead
    };
    const commonRecord = await this.getCommonSettings();
    const puzzleRecord = await this.getPuzzleSettings(puzzleId);
    return {
      ...defaults,
      ...commonRecord?.puzzlePreferences,
      ...puzzleRecord?.puzzlePreferences,
    };
  }

  /**
   * Merge prefs into persisted puzzle preferences for puzzleId or persisted
   * common preferences as appropriate.
   */
  async setPuzzlePreferences(puzzleId: PuzzleId, prefs: ConfigValues): Promise<void> {
    const { commonPreferences, puzzlePreferences } = this.splitPuzzlePreferences(prefs);
    if (commonPreferences !== undefined) {
      const current = await this.getCommonSettings();
      const updated: CommonPuzzleSettings = {
        ...current,
        puzzlePreferences: {
          ...current?.puzzlePreferences,
          ...commonPreferences,
        },
      };

      await this.db.settings.put({
        id: "puzzle-common",
        type: "puzzle-common",
        data: updated,
      });
    }
    if (puzzlePreferences !== undefined) {
      const current = await this.getPuzzleSettings(puzzleId);
      const updated: PuzzleSettings = {
        customPresets: [],
        ...current,
        puzzlePreferences: {
          ...current?.puzzlePreferences,
          ...puzzlePreferences,
        },
      };

      await this.db.settings.put({
        id: puzzleId,
        type: "puzzle",
        data: updated,
      });
    }
  }

  private splitPuzzlePreferences(prefs: ConfigValues): {
    commonPreferences?: ConfigValues;
    puzzlePreferences?: ConfigValues;
  } {
    // Right now, the only common puzzle preference is one-key-shortcuts.
    // TODO: move this function to src/puzzle/augment
    const { "one-key-shortcuts": oneKeyShortcuts, ...rest } = prefs;
    const commonPreferences =
      oneKeyShortcuts !== undefined
        ? { "one-key-shortcuts": oneKeyShortcuts }
        : undefined;
    const puzzlePreferences = Object.keys(rest).length > 0 ? rest : undefined;
    return { commonPreferences, puzzlePreferences };
  }
}

export type { Store };

// Singleton store instance
export const store = new Store();
