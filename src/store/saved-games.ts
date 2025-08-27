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
      .where("[puzzleId+saveType+timestamp]")
      .between(
        [puzzleId ?? PUZZLE_ID_MIN, SaveType.User, TIMESTAMP_MIN],
        [puzzleId ?? PUZZLE_ID_MAX, SaveType.User, TIMESTAMP_MAX],
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
  async deleteSavedGame(puzzleOrId: Puzzle | PuzzleId, filename: string) {
    const puzzleId = typeof puzzleOrId === "string" ? puzzleOrId : puzzleOrId.puzzleId;
    await db.savedGames.delete([puzzleId, SaveType.User, filename]);
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
        const suffix = Number.parseInt(filename.slice(baseName.length));
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
      // Extract puzzleIds from the puzzleId+saveType index where SaveType.Auto
      const keys = (await db.savedGames
        .where("[puzzleId+saveType+timestamp]")
        .between(
          [PUZZLE_ID_MIN, SaveType.Auto, TIMESTAMP_MIN],
          [PUZZLE_ID_MAX, SaveType.Auto, TIMESTAMP_MAX],
        )
        .uniqueKeys()) as unknown as [PuzzleId, SaveType, number][];
      return new Set(keys.map((key) => key[0]));
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
    await this.saveToDB({
      puzzle,
      filename: autoSaveId,
      saveType: SaveType.Auto,
    });
  }

  async removeAutoSavedGame(puzzleOrId: Puzzle | PuzzleId, autoSaveId: string) {
    const puzzleId = typeof puzzleOrId === "string" ? puzzleOrId : puzzleOrId.puzzleId;
    // (Table.delete does nothing if primary key not in table.)
    // (Unlike Table.get, compound primary key must be passed as array.)
    await db.savedGames.delete([puzzleId, SaveType.Auto, autoSaveId]);
  }

  async restoreAutoSavedGame(puzzle: Puzzle, autoSaveId: string): Promise<boolean> {
    const { found, error } = await this.loadFromDB({
      puzzle,
      saveType: SaveType.Auto,
      filename: autoSaveId,
    });
    if (error) {
      throw new Error(`Error restoring autosave ${autoSaveId}: ${error}`);
    }
    return found;
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

    const buffer = await record.data.arrayBuffer();
    const data = new Uint8Array(buffer);
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
    const savedGame = await puzzle.saveGame();
    const data = new Blob([savedGame]);
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
