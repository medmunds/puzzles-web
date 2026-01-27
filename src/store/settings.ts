import { computed } from "@lit-labs/signals";
import { SignalMap } from "signal-utils/map";
import { effect } from "signal-utils/subtle/microtask-effect";
import type { ConfigValues, PuzzleId } from "../puzzle/types.ts";
import {
  type CommonSettings,
  db,
  type PuzzleSettings,
  type SettingsRecord,
} from "./db.ts";

const SETTINGS_BACKUP_SCHEMA =
  "https://twistymaze.com/puzzles/schemas/puzzle-settings-backup-v1.json";
export interface SerializedSettings {
  $schema: string;
  data: SettingsRecord[];
}

export const isSerializedSettings = (obj: unknown): obj is SerializedSettings =>
  typeof obj === "object" &&
  obj !== null &&
  "$schema" in obj &&
  "data" in obj &&
  Array.isArray(obj.data);

const defaultSettings = {
  allowOfflineUse: null,
  autoUpdate: null,
  colorScheme: "light", // change to "system" when dark mode no longer experimental
  favoritePuzzles: [
    "keen",
    "mines",
    "net",
    "samegame",
    "solo",
    "untangle",
  ] as PuzzleId[],
  showIntro: true,
  showUnfinishedPuzzles: false,
  showMouseButtonToggle: false,
  rightButtonLongPress: true,
  rightButtonTwoFingerTap: true,
  rightButtonAudioVolume: 40,
  rightButtonHoldTime: 350,
  rightButtonDragThreshold: 8,
  showEndNotification: true,
  showPuzzleKeyboard: true,
  statusbarPlacement: "start",
  maxScale: Number.POSITIVE_INFINITY,
} as const;

const COMMON_SETTINGS_ID = "puzzle-common";

class Settings {
  // Reactive CommonSettings record with values in DB format
  private _commonSettings = new SignalMap<keyof CommonSettings, unknown>();
  private _isLoadingCommonSettings = false;
  private _commonSettingsEffectDisposer?: () => void;

  private readonly _loaded: Promise<void>;

  constructor() {
    this._commonSettingsEffectDisposer = effect(this.autoSaveCommonSettings);
    window.addEventListener("pageshow", this.handlePageShow);
    this._loaded = this.loadSettings();
  }

  // In regular app use, the settings singleton lives forever,
  // so this destructor never runs. But it may be useful in tests.
  destroy() {
    window.removeEventListener("pageshow", this.handlePageShow);
    this._commonSettingsEffectDisposer?.();
    this._commonSettingsEffectDisposer = undefined;
  }

  /**
   * Resolved once initial settings have been loaded.
   * (Settings will have default values if accessed before that.)
   */
  get loaded(): Promise<void> {
    return this._loaded;
  }

  private handlePageShow = async (event: PageTransitionEvent) => {
    if (event.persisted) {
      await this.loadSettings();
    }
  };

  private async loadSettings(): Promise<void> {
    this._isLoadingCommonSettings = true;
    try {
      // TODO: Use a Dexie.liveQuery so multiple tabs stay in sync
      //   (would also make pageshow.persisted logic redundant)
      const record = await this.getCommonSettings();
      this._commonSettings.clear();
      for (const [key, value] of Object.entries(record)) {
        this._commonSettings.set(key as keyof CommonSettings, value);
      }
    } finally {
      await Promise.resolve(); // flush microtask queue
      this._isLoadingCommonSettings = false;
    }
  }

  private autoSaveCommonSettings = () => {
    // Runs as an effect on _commonSettings changes.
    // Persist settings to DB, except while loading or during initial setup.
    // (_commonSettings is empty until after first load.)
    const entries = this._commonSettings.entries();
    if (!this._isLoadingCommonSettings && this._commonSettings.size > 0) {
      const record = Object.fromEntries(entries) as CommonSettings;
      void this.setCommonSettings(record);
    }
  };

  private getCommonSetting<K extends keyof CommonSettings>(
    key: K,
  ): CommonSettings[K] | undefined {
    return this._commonSettings.get(key) as CommonSettings[K];
  }

  private setCommonSetting<K extends keyof CommonSettings>(
    key: K,
    value: Required<CommonSettings>[K],
  ) {
    this._commonSettings.set(key, value);
  }

  // private resetCommonSetting<K extends keyof CommonSettings>(key: K) {
  //   // Use undefined as tombstone until next merge with existing DB record
  //   this._commonSettings.set(key, undefined);
  // }

  //
  // PWAManager-only reactive settings
  //

  // For PWAManager use only (use pwaManager.allowOfflineUse instead)
  get allowOfflineUse(): boolean | null {
    return this.getCommonSetting("allowOfflineUse") ?? null;
  }
  set allowOfflineUse(value: boolean) {
    this.setCommonSetting("allowOfflineUse", value);
  }

  // For PWAManager use only (use pwaManager.autoUpdate instead)
  get autoUpdate(): boolean | null {
    return this.getCommonSetting("autoUpdate") ?? null;
  }
  set autoUpdate(value: boolean) {
    this.setCommonSetting("autoUpdate", value);
  }

  //
  // Public reactive settings
  //

  // Accessors for reactive signals
  get colorScheme(): "light" | "dark" | "system" {
    return this.getCommonSetting("colorScheme") ?? defaultSettings.colorScheme;
  }
  set colorScheme(value: "light" | "dark" | "system") {
    this.setCommonSetting("colorScheme", value);
    // Also track in localStorage: see color-scheme-init.ts
    try {
      localStorage.setItem("colorScheme", value);
    } catch {
      // privacy manager -- they'll get a flash of light mode
      // until script and settings load.
    }
  }

  private _favoritePuzzles = computed<ReadonlySet<PuzzleId>>(
    () =>
      new Set(
        this.getCommonSetting("favoritePuzzles") ?? defaultSettings.favoritePuzzles,
      ),
  );

  get favoritePuzzles(): ReadonlySet<PuzzleId> {
    return this._favoritePuzzles.get();
  }

  isFavoritePuzzle(puzzleId: PuzzleId): boolean {
    return this.favoritePuzzles.has(puzzleId);
  }

  async setFavoritePuzzle(puzzleId: PuzzleId, isFavorite: boolean): Promise<void> {
    const wasFavorite = this.isFavoritePuzzle(puzzleId);
    if (wasFavorite !== isFavorite) {
      const oldFavorites =
        this.getCommonSetting("favoritePuzzles") ?? defaultSettings.favoritePuzzles;
      const newFavorites = isFavorite
        ? [...oldFavorites, puzzleId].sort()
        : oldFavorites.filter((id) => id !== puzzleId);
      this.setCommonSetting("favoritePuzzles", newFavorites);
    }
  }

  get showIntro(): boolean {
    return this.getCommonSetting("showIntro") ?? defaultSettings.showIntro;
  }
  set showIntro(value: boolean) {
    this.setCommonSetting("showIntro", value);
  }

  get showUnfinishedPuzzles(): boolean {
    return (
      this.getCommonSetting("showUnfinishedPuzzles") ??
      defaultSettings.showUnfinishedPuzzles
    );
  }
  set showUnfinishedPuzzles(value: boolean) {
    this.setCommonSetting("showUnfinishedPuzzles", value);
  }

  get showMouseButtonToggle(): boolean {
    return (
      this.getCommonSetting("showMouseButtonToggle") ??
      defaultSettings.showMouseButtonToggle
    );
  }
  set showMouseButtonToggle(value: boolean) {
    this.setCommonSetting("showMouseButtonToggle", value);
  }

  get rightButtonLongPress(): boolean {
    return (
      this.getCommonSetting("rightButtonLongPress") ??
      defaultSettings.rightButtonLongPress
    );
  }
  set rightButtonLongPress(value: boolean) {
    this.setCommonSetting("rightButtonLongPress", value);
  }

  get rightButtonTwoFingerTap(): boolean {
    return (
      this.getCommonSetting("rightButtonTwoFingerTap") ??
      defaultSettings.rightButtonTwoFingerTap
    );
  }
  set rightButtonTwoFingerTap(value: boolean) {
    this.setCommonSetting("rightButtonTwoFingerTap", value);
  }

  get rightButtonAudioVolume(): number {
    return (
      this.getCommonSetting("rightButtonAudioVolume") ??
      defaultSettings.rightButtonAudioVolume
    );
  }
  set rightButtonAudioVolume(value: number) {
    this.setCommonSetting("rightButtonAudioVolume", value);
  }

  get rightButtonHoldTime(): number {
    return (
      this.getCommonSetting("rightButtonHoldTime") ??
      defaultSettings.rightButtonHoldTime
    );
  }
  set rightButtonHoldTime(value: number) {
    this.setCommonSetting("rightButtonHoldTime", value);
  }

  get rightButtonDragThreshold(): number {
    return (
      this.getCommonSetting("rightButtonDragThreshold") ??
      defaultSettings.rightButtonDragThreshold
    );
  }
  set rightButtonDragThreshold(value: number) {
    this.setCommonSetting("rightButtonDragThreshold", value);
  }

  get showEndNotification(): boolean {
    return (
      this.getCommonSetting("showEndNotification") ??
      defaultSettings.showEndNotification
    );
  }
  set showEndNotification(value: boolean) {
    this.setCommonSetting("showEndNotification", value);
  }

  get showPuzzleKeyboard(): boolean {
    return (
      this.getCommonSetting("showPuzzleKeyboard") ?? defaultSettings.showPuzzleKeyboard
    );
  }
  set showPuzzleKeyboard(value: boolean) {
    this.setCommonSetting("showPuzzleKeyboard", value);
  }

  get statusbarPlacement(): "start" | "end" | "hidden" {
    return (
      this.getCommonSetting("statusbarPlacement") ?? defaultSettings.statusbarPlacement
    );
  }
  set statusbarPlacement(value: "start" | "end" | "hidden") {
    this.setCommonSetting("statusbarPlacement", value);
  }

  get maxScale(): number {
    let value = this.getCommonSetting("maxScale");
    if (value === undefined) {
      value = defaultSettings.maxScale; // but leave null alone
    }
    return value === null ? Number.POSITIVE_INFINITY : value;
  }
  set maxScale(value: number) {
    // Store Infinity as null (for json serialization)
    this.setCommonSetting(
      "maxScale",
      value === Number.POSITIVE_INFINITY ? null : value,
    );
  }

  //
  // Settings DB access
  //

  private async getCommonSettings(): Promise<CommonSettings> {
    const record = await db.settings.get(COMMON_SETTINGS_ID);
    return record?.type === "puzzle-common" ? record.data : { puzzlePreferences: {} };
  }

  private async setCommonSettings(record: CommonSettings) {
    // Theoretically, we could just write the entire record, but merge
    // with any existing record in case another tab has edited it.
    // Remove any keys that end up with undefined values after merging.
    const current = await this.getCommonSettings();
    const merged = Object.entries({ ...current, ...record }).filter(
      ([, value]) => value !== undefined,
    );
    const updated = Object.fromEntries(merged) as CommonSettings;
    await db.settings.put({
      id: COMMON_SETTINGS_ID,
      type: "puzzle-common",
      data: updated,
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
    const commonPuzzlePreferences = this.getCommonSetting("puzzlePreferences");
    const puzzleRecord = await this.getPuzzleSettings(puzzleId);
    return {
      ...defaults,
      ...commonPuzzlePreferences,
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
      this.setCommonSetting("puzzlePreferences", commonPreferences);
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

  async getLastUnfinishedAlert(puzzleId: PuzzleId): Promise<number | undefined> {
    const puzzleRecord = await this.getPuzzleSettings(puzzleId);
    return puzzleRecord?.lastUnfinishedAlert;
  }

  async setLastUnfinishedAlert(
    puzzleId: PuzzleId,
    lastUnfinishedAlert: number,
  ): Promise<void> {
    const { lastUnfinishedAlert: _, ...current } =
      (await this.getPuzzleSettings(puzzleId)) ?? {};
    const updated: PuzzleSettings = { ...current, lastUnfinishedAlert };
    await db.settings.put({
      id: puzzleId,
      type: "puzzle",
      data: updated,
    });
  }

  async clearCommonSettings() {
    await db.settings.delete(COMMON_SETTINGS_ID);
    await this.loadSettings();
  }

  async clearPuzzleSettings(puzzleId: PuzzleId) {
    await db.settings.delete(puzzleId);
    // TODO: this needs to somehow trigger Puzzle(puzzleId) reload default settings
    await this.loadSettings();
  }

  async clearAllSettings() {
    await db.settings.clear();
    // TODO: this may need to trigger current Puzzle reload default settings
    await this.loadSettings();
  }

  /*
   * Serialization (for backup/restore)
   */

  async serialize(): Promise<SerializedSettings> {
    const data = await db.settings.toArray();
    return { $schema: SETTINGS_BACKUP_SCHEMA, data };
  }

  async deserialize(backup: unknown): Promise<void> {
    if (!isSerializedSettings(backup)) {
      throw new Error("Invalid settings backup format");
    }
    if (backup.$schema !== SETTINGS_BACKUP_SCHEMA) {
      throw new Error("Incompatible settings backup schema");
    }
    await db.settings.bulkPut(backup.data);
    await this.loadSettings();
  }
}

// Singleton settings store instance
export const settings = new Settings();
