import { type Signal, signal } from "@lit-labs/signals";
import * as Sentry from "@sentry/browser";
import type { ConfigValues } from "../puzzle/types.ts";
import { equalSet } from "../utils/equal.ts";
import { type CommonSettings, db, type PuzzleId, type PuzzleSettings } from "./db.ts";

const defaultSettings = {
  favoritePuzzles: new Set<PuzzleId>(),
  showUnfinishedPuzzles: false,
  rightButtonLongPress: true,
  rightButtonTwoFingerTap: true,
  rightButtonAudioVolume: 40,
  rightButtonHoldTime: 350,
  rightButtonDragThreshold: 8,
  maxScale: Number.POSITIVE_INFINITY,
  showStatusbar: true,
} as const;

class Settings {
  // Reactive signals for individual settings
  private _favoritePuzzles = signal<ReadonlySet<PuzzleId>>(
    defaultSettings.favoritePuzzles,
  );
  private _showUnfinishedPuzzles = signal<boolean>(
    defaultSettings.showUnfinishedPuzzles,
  );

  private _rightButtonLongPress = signal<boolean>(defaultSettings.rightButtonLongPress);
  private _rightButtonTwoFingerTap = signal<boolean>(
    defaultSettings.rightButtonTwoFingerTap,
  );
  private _rightButtonAudioVolume = signal<number>(
    defaultSettings.rightButtonAudioVolume,
  );
  private _rightButtonHoldTime = signal<number>(defaultSettings.rightButtonHoldTime);
  private _rightButtonDragThreshold = signal<number>(
    defaultSettings.rightButtonDragThreshold,
  );
  private _maxScale = signal<number>(defaultSettings.maxScale);
  private _showStatusbar = signal<boolean>(defaultSettings.showStatusbar);

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
      const favoritePuzzles = new Set(commonSettings.favoritePuzzles);
      if (!equalSet(favoritePuzzles, this._favoritePuzzles.get())) {
        this._favoritePuzzles.set(favoritePuzzles);
      }
      update(this._showUnfinishedPuzzles, commonSettings.showUnfinishedPuzzles);
      update(this._rightButtonLongPress, commonSettings.rightButtonLongPress);
      update(this._rightButtonTwoFingerTap, commonSettings.rightButtonTwoFingerTap);
      update(this._rightButtonAudioVolume, commonSettings.rightButtonAudioVolume);
      update(this._rightButtonHoldTime, commonSettings.rightButtonHoldTime);
      update(this._rightButtonDragThreshold, commonSettings.rightButtonDragThreshold);
      update(this._maxScale, commonSettings.maxScale);
      update(this._showStatusbar, commonSettings.showStatusbar);
    }
  }

  // Accessors for reactive signals
  get favoritePuzzles(): ReadonlySet<PuzzleId> {
    return this._favoritePuzzles.get();
  }
  set favoritePuzzles(value: ReadonlySet<PuzzleId>) {
    this._favoritePuzzles.set(value);
    this.saveCommonSettingOrLogError("favoritePuzzles", [...value]);
  }

  isFavoritePuzzle(puzzleId: PuzzleId): boolean {
    return this.favoritePuzzles.has(puzzleId);
  }
  async setFavoritePuzzle(puzzleId: PuzzleId, isFavorite: boolean): Promise<void> {
    const wasFavorite = this.isFavoritePuzzle(puzzleId);
    if (isFavorite !== wasFavorite) {
      const favorites = new Set(this.favoritePuzzles);
      if (isFavorite) {
        favorites.add(puzzleId);
      } else {
        favorites.delete(puzzleId);
      }
      this.favoritePuzzles = favorites;
    }
  }

  get showUnfinishedPuzzles(): boolean {
    return this._showUnfinishedPuzzles.get();
  }
  set showUnfinishedPuzzles(value: boolean) {
    this._showUnfinishedPuzzles.set(value);
    this.saveCommonSettingOrLogError("showUnfinishedPuzzles", value);
  }

  get rightButtonLongPress(): boolean {
    return this._rightButtonLongPress.get();
  }
  set rightButtonLongPress(value: boolean) {
    this._rightButtonLongPress.set(value);
    this.saveCommonSettingOrLogError("rightButtonLongPress", value);
  }

  get rightButtonTwoFingerTap(): boolean {
    return this._rightButtonTwoFingerTap.get();
  }
  set rightButtonTwoFingerTap(value: boolean) {
    this._rightButtonTwoFingerTap.set(value);
    this.saveCommonSettingOrLogError("rightButtonTwoFingerTap", value);
  }

  get rightButtonAudioVolume(): number {
    return this._rightButtonAudioVolume.get();
  }
  set rightButtonAudioVolume(value: number) {
    this._rightButtonAudioVolume.set(value);
    this.saveCommonSettingOrLogError("rightButtonAudioVolume", value);
  }

  get rightButtonHoldTime(): number {
    return this._rightButtonHoldTime.get();
  }
  set rightButtonHoldTime(value: number) {
    this._rightButtonHoldTime.set(value);
    this.saveCommonSettingOrLogError("rightButtonHoldTime", value);
  }

  get rightButtonDragThreshold(): number {
    return this._rightButtonDragThreshold.get();
  }
  set rightButtonDragThreshold(value: number) {
    this._rightButtonDragThreshold.set(value);
    this.saveCommonSettingOrLogError("rightButtonDragThreshold", value);
  }

  get maxScale(): number {
    return this._maxScale.get();
  }
  set maxScale(value: number) {
    this._maxScale.set(value);
    this.saveCommonSettingOrLogError("maxScale", value);
  }

  get showStatusbar(): boolean {
    return this._showStatusbar.get();
  }
  set showStatusbar(value: boolean) {
    this._showStatusbar.set(value);
    this.saveCommonSettingOrLogError("showStatusbar", value);
  }

  // Settings methods
  private async getCommonSettings(): Promise<CommonSettings> {
    const record = await db.settings.get("puzzle-common");
    return record?.type === "puzzle-common" ? record.data : { puzzlePreferences: {} };
  }

  private async saveCommonSetting<K extends keyof CommonSettings>(
    name: K,
    value: CommonSettings[K],
  ) {
    const current = await this.getCommonSettings();
    if (current[name] !== value) {
      const updated: CommonSettings = {
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

  // Ugh. Non-async version of above, for use in property setters.
  private saveCommonSettingOrLogError<K extends keyof CommonSettings>(
    name: K,
    value: CommonSettings[K],
  ) {
    this.saveCommonSetting(name, value).catch((error: Error) => {
      console.error(error);
      Sentry.captureException(error);
    });
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
      const updated: CommonSettings = {
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
