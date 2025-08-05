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
    const puzzleId = puzzle.puzzleId;
    const timestamp = Date.now();
    const status = puzzle.status;
    const gameId = puzzle.currentGameId ?? "";
    const savedGame = await puzzle.saveGame();
    const data = new Blob([savedGame]);
    const checkpoints = [...puzzle.checkpoints];
    await db.savedGames.put({
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
    await db.savedGames.delete([puzzleId, SaveType.Auto, autoSaveId]);
  }

  async restoreAutoSavedGame(puzzle: Puzzle, autoSaveId: string): Promise<boolean> {
    const record = await db.savedGames.get({
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

// Singleton saved games store instance
export const savedGames = new SavedGames();
