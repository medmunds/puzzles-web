import Dexie, { type EntityTable, liveQuery, type Observable, type Table } from "dexie";
import type { Puzzle } from "./puzzle/puzzle.ts";
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
  params?: EncodedParams;
}

const defaultPuzzleSettings: PuzzleSettings = {
  puzzlePreferences: {},
  customPresets: [],
};

export type SettingsRecord =
  | { id: "catalog"; type: "catalog"; data: CatalogSettings }
  | { id: "puzzle-common"; type: "puzzle-common"; data: CommonPuzzleSettings }
  | { id: PuzzleId; type: "puzzle"; data: PuzzleSettings };

enum SaveType {
  User = 0,
  Auto = 1,
}
const TIMESTAMP_MIN = Dexie.minKey;
const TIMESTAMP_MAX = Dexie.maxKey;
const PUZZLE_ID_MIN = Dexie.minKey;
const PUZZLE_ID_MAX = Dexie.maxKey;

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

// TODO: split out SettingsStore, SavedGamesStore (with shared Database)
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
        ...defaultPuzzleSettings,
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

  async getParams(puzzleId: PuzzleId): Promise<string | undefined> {
    const puzzleRecord = await this.getPuzzleSettings(puzzleId);
    return puzzleRecord?.params;
  }

  async setParams(puzzleId: PuzzleId, params?: EncodedParams): Promise<void> {
    const current = await this.getPuzzleSettings(puzzleId);
    const updated: PuzzleSettings = {
      ...defaultPuzzleSettings,
      ...current,
      params,
    };
    await this.db.settings.put({
      id: puzzleId,
      type: "puzzle",
      data: updated,
    });
  }

  //
  // Saved games
  //

  /**
   * Return a list of saved games for puzzleId if provided, or all puzzles if not.
   */
  async listSavedGames(puzzleId?: PuzzleId): Promise<readonly SavedGameMetadata[]> {
    return this.db.savedGames
      .where("[puzzleId+saveType+timestamp]")
      .between(
        [puzzleId ?? PUZZLE_ID_MIN, SaveType.User, TIMESTAMP_MIN],
        [puzzleId ?? PUZZLE_ID_MAX, SaveType.User, TIMESTAMP_MAX],
      )
      .toArray();
  }

  /**
   * Return a set of each PuzzleId that has at least one autosaved game.
   */
  autoSavedPuzzles = async (): Promise<Set<PuzzleId>> => {
    // Extract puzzleIds from the puzzleId+saveType index where SaveType.Auto
    const keys = (await this.db.savedGames
      .where("[puzzleId+saveType+timestamp]")
      .between(
        [PUZZLE_ID_MIN, SaveType.Auto, TIMESTAMP_MIN],
        [PUZZLE_ID_MAX, SaveType.Auto, TIMESTAMP_MAX],
      )
      .uniqueKeys()) as unknown as [PuzzleId, SaveType, number][];
    return new Set(keys.map((key) => key[0]));
  };

  private _autoSavedPuzzlesLiveQuery?: Observable<Set<PuzzleId>>;
  get autoSavedPuzzlesLiveQuery() {
    if (!this._autoSavedPuzzlesLiveQuery) {
      this._autoSavedPuzzlesLiveQuery = liveQuery(this.autoSavedPuzzles);
    }
    return this._autoSavedPuzzlesLiveQuery;
  }

  /**
   * Return the filename of the most recent autosave for puzzleId, if any.
   */
  async findMostRecentAutoSave(puzzleId: PuzzleId): Promise<string | undefined> {
    const record = await this.db.savedGames
      .where("[puzzleId+saveType+timestamp]")
      .between(
        [puzzleId, SaveType.Auto, TIMESTAMP_MIN],
        [puzzleId, SaveType.Auto, TIMESTAMP_MAX],
      )
      .last();

    return record?.filename;
  }

  makeAutoSaveId(): string {
    // This could be a uuid or some random chars to avoid possible duplication,
    // but a timestamp is probably sufficient for now.
    return `autosave-${Date.now()}`;
  }

  /**
   * Create or update the autosave record for puzzle.
   */
  async autoSaveGame(puzzle: Puzzle, autoSaveId: string) {
    const puzzleId = puzzle.puzzleId;
    const timestamp = Date.now();
    const status = puzzle.status;
    const gameId = puzzle.currentGameId ?? "";
    const savedGame = await puzzle.saveGame();
    const data = new Blob([savedGame]);
    const checkpoints = [...puzzle.checkpoints];
    await this.db.savedGames.put({
      puzzleId,
      filename: autoSaveId,
      saveType: SaveType.Auto,
      timestamp,
      status,
      gameId,
      data,
      checkpoints,
    });
  }

  async removeAutoSavedGame(puzzleOrId: Puzzle | PuzzleId, autoSaveId: string) {
    const puzzleId = typeof puzzleOrId === "string" ? puzzleOrId : puzzleOrId.puzzleId;
    // (Table.delete does nothing if primary key not in table.)
    // (Unlike Table.get, compound primary key must be passed as array.)
    await this.db.savedGames.delete([puzzleId, SaveType.Auto, autoSaveId]);
  }

  async restoreAutoSavedGame(puzzle: Puzzle, autoSaveId: string): Promise<boolean> {
    const record = await this.db.savedGames.get({
      puzzleId: puzzle.puzzleId,
      saveType: SaveType.Auto,
      filename: autoSaveId,
    });
    if (!record) {
      return false;
    }

    const buffer = await record.data.arrayBuffer();
    const data = new Uint8Array(buffer);
    const errorMessage = await puzzle.loadGame(data);
    if (errorMessage) {
      throw new Error(`Error restoring autosave ${autoSaveId}: ${errorMessage}`);
    }
    puzzle.checkpoints = record.checkpoints ?? [];
    return true;
  }
}

export type { Store };

// Singleton store instance
export const store = new Store();
