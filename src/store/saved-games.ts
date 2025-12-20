import type { Puzzle } from "../puzzle/puzzle.ts";
import { equalSet } from "../utils/equal.ts";
import { liveQuerySignal } from "../utils/signals.ts";
import {
  db,
  PUZZLE_ID_MAX,
  PUZZLE_ID_MIN,
  type PuzzleId,
  type SavedGameMetadata,
  SaveType,
  TIMESTAMP_MAX,
  TIMESTAMP_MIN,
} from "./db.ts";

class SavedGames {
  /**
   * Return a list of saved games for puzzleId if provided, or all puzzles if not.
   */
  async listSavedGames(puzzleId?: PuzzleId): Promise<readonly SavedGameMetadata[]> {
    return db.savedGames
      .where("[saveType+puzzleId+timestamp]")
      .between(
        [SaveType.User, puzzleId ?? PUZZLE_ID_MIN, TIMESTAMP_MIN],
        [SaveType.User, puzzleId ?? PUZZLE_ID_MAX, TIMESTAMP_MAX],
      )
      .toArray();
  }

  /**
   * A self-updating, reactive Signal version of listSavedGames.
   */
  savedGamesLiveQuery(puzzleId?: PuzzleId) {
    return liveQuerySignal([], () => this.listSavedGames(puzzleId), {
      equals: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    });
  }

  /**
   * Load filename into puzzle.
   * Returns string error message if unsuccessful.
   */
  async loadGame(
    puzzle: Puzzle,
    filename: string,
  ): Promise<{ error?: string; gameId?: string }> {
    const { found, error, gameId } = await this.loadFromDB({
      puzzle,
      filename,
      saveType: SaveType.User,
    });
    if (!found) {
      return { error: `File not found: ${filename}` };
    }
    return { error, gameId };
  }

  /**
   * Save puzzle as filename.
   * (Replaces existing save with same name, if any.)
   */
  async saveGame(puzzle: Puzzle, filename: string) {
    await this.saveToDB({
      puzzle,
      filename,
      saveType: SaveType.User,
    });
  }

  /**
   * Delete saved puzzle. Does nothing if filename doesn't exist.
   */
  async removeSavedGame(puzzleOrId: Puzzle | PuzzleId, filename: string) {
    const puzzleId = typeof puzzleOrId === "string" ? puzzleOrId : puzzleOrId.puzzleId;
    await db.savedGames.delete([puzzleId, SaveType.User, filename]);
  }

  /**
   * Delete all (user-)saved puzzles.
   */
  async removeAllSavedGames() {
    await db.savedGames
      .where("[saveType+puzzleId+timestamp]")
      .between(
        [SaveType.User, PUZZLE_ID_MIN, TIMESTAMP_MIN],
        [SaveType.User, PUZZLE_ID_MAX, TIMESTAMP_MAX],
      )
      .delete();
  }

  /**
   * Return a name of the form `${baseName}${number}` that doesn't currently
   * exist in SavedGames for puzzleId.
   */
  async makeUntitledFilename(
    puzzleId: PuzzleId,
    baseName: string = "Untitled-",
  ): Promise<string> {
    // Find existing filenames for puzzleId that start with baseName
    // and extract the highest numeric suffix.
    let maxSuffix = 0;
    await db.savedGames
      .where("[puzzleId+saveType+filename]")
      .between(
        [puzzleId, SaveType.User, baseName],
        [puzzleId, SaveType.User, `${baseName}\uffff`],
      )
      .each(({ filename }) => {
        const suffix = Number.parseInt(filename.slice(baseName.length), 10);
        if (!Number.isNaN(suffix) && suffix > maxSuffix) {
          maxSuffix = suffix;
        }
      });
    return `${baseName}${maxSuffix + 1}`;
  }

  /**
   * Reactive set of each PuzzleId that has at least one autosaved game.
   */
  get autoSavedPuzzles(): Set<PuzzleId> {
    return this._autoSavedPuzzles.get();
  }

  private _autoSavedPuzzles = liveQuerySignal<Set<PuzzleId>>(
    new Set(),
    async () => {
      // Extract puzzleIds from the saveType+puzzleId index where SaveType.Auto
      const keys = (await db.savedGames
        .where("[saveType+puzzleId+timestamp]")
        .between(
          [SaveType.Auto, PUZZLE_ID_MIN, TIMESTAMP_MIN],
          [SaveType.Auto, PUZZLE_ID_MAX, TIMESTAMP_MAX],
        )
        .uniqueKeys()) as unknown as [SaveType, PuzzleId, number][];
      return new Set(keys.map((key) => key[1]));
    },
    {
      equals: equalSet,
    },
  );

  /**
   * Return the filename of the most recent autosave for puzzleId, if any.
   */
  async findMostRecentAutoSave(puzzleId: PuzzleId): Promise<string | undefined> {
    const record = await db.savedGames
      .where("[saveType+puzzleId+timestamp]")
      .between(
        [SaveType.Auto, puzzleId, TIMESTAMP_MIN],
        [SaveType.Auto, puzzleId, TIMESTAMP_MAX],
      )
      .last();

    return record?.filename;
  }

  makeAutoSaveFilename(): string {
    // This could be a uuid or some random chars to avoid possible duplication,
    // but a timestamp is probably sufficient for now.
    return `autosave-${Date.now()}`;
  }

  /**
   * Create or update the autosave record for puzzle.
   */
  async autoSaveGame(puzzle: Puzzle, autoSaveFilename: string) {
    await this.saveToDB({
      puzzle,
      filename: autoSaveFilename,
      saveType: SaveType.Auto,
    });
  }

  async removeAutoSavedGame(puzzleOrId: Puzzle | PuzzleId, autoSaveFilename: string) {
    const puzzleId = typeof puzzleOrId === "string" ? puzzleOrId : puzzleOrId.puzzleId;
    // (Table.delete does nothing if primary key not in table.)
    // (Unlike Table.get, compound primary key must be passed as array.)
    await db.savedGames.delete([puzzleId, SaveType.Auto, autoSaveFilename]);
  }

  async restoreAutoSavedGame(
    puzzle: Puzzle,
    autoSaveFilename: string,
  ): Promise<boolean> {
    const { found, error } = await this.loadFromDB({
      puzzle,
      saveType: SaveType.Auto,
      filename: autoSaveFilename,
    });
    if (error) {
      throw new Error(`Error restoring autosave ${autoSaveFilename}: ${error}`);
    }
    return found;
  }

  async removeAllAutoSavedGames() {
    await db.savedGames
      .where("[saveType+puzzleId+timestamp]")
      .between(
        [SaveType.Auto, PUZZLE_ID_MIN, TIMESTAMP_MIN],
        [SaveType.Auto, PUZZLE_ID_MAX, TIMESTAMP_MAX],
      )
      .delete();
  }

  /**
   * Delete all saved games of any type (clear the savedGames table)
   */
  async removeAll() {
    await db.savedGames.clear();
  }

  /**
   * Loads filename into puzzle and returns true if successful.
   * If filename does not exist, returns false.
   * If filename exists but has an error, returns the error message.
   */
  private async loadFromDB({
    puzzle,
    filename,
    saveType,
  }: {
    puzzle: Puzzle;
    filename: string;
    saveType: SaveType;
  }): Promise<{ found: boolean; error?: string; gameId?: string }> {
    const record = await db.savedGames.get({
      puzzleId: puzzle.puzzleId,
      saveType,
      filename,
    });
    if (!record) {
      return { found: false };
    }

    let data: Uint8Array<ArrayBuffer>;
    if (record.data instanceof Blob) {
      // Blob data (stored by earlier versions)
      const buffer = await record.data.arrayBuffer();
      data = new Uint8Array(buffer);
    } else {
      data = record.data;
    }
    const error = await puzzle.loadGame(data);
    if (error) {
      return { found: true, error };
    }
    puzzle.checkpoints = record.checkpoints ?? [];
    return { found: true, gameId: record.gameId };
  }

  /**
   * Saves puzzle into filename, overwriting any existing item.
   */
  private async saveToDB({
    puzzle,
    filename,
    saveType,
  }: {
    puzzle: Puzzle;
    filename: string;
    saveType: SaveType;
  }) {
    const puzzleId = puzzle.puzzleId;
    const timestamp = Date.now();
    const status = puzzle.status;
    const gameId = puzzle.currentGameId ?? "";
    const data: Uint8Array<ArrayBuffer> = await puzzle.saveGame();
    // (Earlier versions converted data to a Blob, which is both unnecessary
    // and not supported in IndexedDB by Safari private browsing mode.)
    const checkpoints = [...puzzle.checkpoints];
    await db.savedGames.put({
      puzzleId,
      filename,
      saveType,
      timestamp,
      status,
      gameId,
      data,
      checkpoints,
    });
  }
}

// Singleton saved games store instance
export const savedGames = new SavedGames();
