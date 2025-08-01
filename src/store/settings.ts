import { type Signal, signal } from "@lit-labs/signals";
import type { ConfigValues } from "../puzzle/types.ts";
import {
  type CommonPuzzleSettings,
  type PuzzleId,
  type PuzzleSettings,
  db,
} from "./db.ts";

const defaultSettings = {
  rightButtonLongPress: true,
  rightButtonTwoFingerTap: true,
  rightButtonHoldTime: 350,
  rightButtonDragThreshold: 8,
  maximizePuzzleSize: 5,
} as const;

class Settings {
  // Reactive signals for individual settings
  private _rightButtonLongPress = signal<boolean>(defaultSettings.rightButtonLongPress);
  private _rightButtonTwoFingerTap = signal<boolean>(
    defaultSettings.rightButtonTwoFingerTap,
  );
  private _rightButtonHoldTime = signal<number>(defaultSettings.rightButtonHoldTime);
  private _rightButtonDragThreshold = signal<number>(
    defaultSettings.rightButtonDragThreshold,
  );
  private _maximizePuzzleSize = signal<number>(defaultSettings.maximizePuzzleSize);

  private constructor() {}

  static async create(): Promise<Settings> {
    const settings = new Settings();
    await settings.loadSettings();
    return settings;
  }

  private async loadSettings(): Promise<void> {
    function update<T>(signal: Signal.State<T>, newValue: T | undefined) {
      if (newValue !== undefined && signal.get() !== newValue) {
        signal.set(newValue);
      }
    }

    const commonSettings = await this.getCommonSettings();
    if (commonSettings) {
      update(this._rightButtonLongPress, commonSettings.rightButtonLongPress);
      update(this._rightButtonTwoFingerTap, commonSettings.rightButtonTwoFingerTap);
      update(this._rightButtonHoldTime, commonSettings.rightButtonHoldTime);
      update(this._rightButtonDragThreshold, commonSettings.rightButtonDragThreshold);
      update(this._maximizePuzzleSize, commonSettings.maximizePuzzleSize);
    }
  }

  // Accessors for reactive signals
  // TODO: promises are being dropped in setters
  get rightButtonLongPress(): boolean {
    return this._rightButtonLongPress.get();
  }
  set rightButtonLongPress(value: boolean) {
    this._rightButtonLongPress.set(value);
    this.saveCommonSetting("rightButtonLongPress", value);
  }

  get rightButtonTwoFingerTap(): boolean {
    return this._rightButtonTwoFingerTap.get();
  }
  set rightButtonTwoFingerTap(value: boolean) {
    this._rightButtonTwoFingerTap.set(value);
    this.saveCommonSetting("rightButtonTwoFingerTap", value);
  }

  get rightButtonHoldTime(): number {
    return this._rightButtonHoldTime.get();
  }
  set rightButtonHoldTime(value: number) {
    this._rightButtonHoldTime.set(value);
    this.saveCommonSetting("rightButtonHoldTime", value);
  }

  get rightButtonDragThreshold(): number {
    return this._rightButtonDragThreshold.get();
  }
  set rightButtonDragThreshold(value: number) {
    this._rightButtonDragThreshold.set(value);
    this.saveCommonSetting("rightButtonDragThreshold", value);
  }

  get maximizePuzzleSize(): number {
    return this._maximizePuzzleSize.get();
  }
  set maximizePuzzleSize(value: number) {
    this._maximizePuzzleSize.set(value);
    this.saveCommonSetting("maximizePuzzleSize", value);
  }

  // Settings methods
  private async getCommonSettings(): Promise<CommonPuzzleSettings> {
    const record = await db.settings.get("puzzle-common");
    return record?.type === "puzzle-common" ? record.data : { puzzlePreferences: {} };
  }

  private async saveCommonSetting<K extends keyof CommonPuzzleSettings>(
    name: K,
    value: CommonPuzzleSettings[K],
  ) {
    const current = await this.getCommonSettings();
    if (current[name] !== value) {
      const updated: CommonPuzzleSettings = {
        ...current,
        [name]: value,
      };
      if (value === undefined) {
        delete updated[name];
      }
      await db.settings.put({
        id: "puzzle-common",
        type: "puzzle-common",
        data: updated,
      });
    }
  }

  private async getPuzzleSettings(
    puzzleId: PuzzleId,
  ): Promise<PuzzleSettings | undefined> {
    const record = await db.settings.get(puzzleId);
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

      await db.settings.put({
        id: "puzzle-common",
        type: "puzzle-common",
        data: updated,
      });
    }

    if (puzzlePreferences !== undefined) {
      const current = await this.getPuzzleSettings(puzzleId);
      const updated: PuzzleSettings = {
        ...current,
        puzzlePreferences: {
          ...current?.puzzlePreferences,
          ...puzzlePreferences,
        },
      };

      await db.settings.put({
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

  async setParams(puzzleId: PuzzleId, params?: string): Promise<void> {
    const { params: _, ...current } = (await this.getPuzzleSettings(puzzleId)) ?? {};
    const updated: PuzzleSettings =
      params === undefined
        ? current
        : {
            ...current,
            params,
          };
    await db.settings.put({
      id: puzzleId,
      type: "puzzle",
      data: updated,
    });
  }
}

// Singleton settings store instance
export const settings = await Settings.create();
