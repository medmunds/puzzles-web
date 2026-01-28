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

const defaultFavoritePuzzles: PuzzleId[] = [
  "keen",
  "mines",
  "net",
  "samegame",
  "solo",
  "untangle",
] as const;

const COMMON_SETTINGS_ID = "puzzle-common";

//
// @commonSetting decorator
//

const getCommonSetting = Symbol("getCommonSetting");
const setCommonSetting = Symbol("setCommonSetting");

type RequiredCommonSettings = Required<CommonSettings>;

interface CommonSettingOptions<K extends keyof CommonSettings, D, V> {
  default: D;
  fromDB?: (value: RequiredCommonSettings[K]) => V;
  toDB?: (value: V) => RequiredCommonSettings[K];

  // (Prefer reactive effects to setCallback when possible)
  setCallback?: (value: V) => void;
}

/**
 * @commonSetting decorator. Defines getter and setter for a reactive property
 * persisted to CommonSettings. Use in the Settings class. E.g.:
 *
 *   @commonSetting({ default: 10 })
 *   declare myNumericSetting: number;
 *
 * If the default value is a different type than can be set, use (e.g.):
 *
 *   @commonSetting<boolean>({ default: null })
 *   declare myBooleanSetting: boolean | null;
 *
 * If the database (CommonSettings) type is different from the property type,
 * define fromDB and toDB functions.
 *
 * @template V The type used for setting the property. Defaults to the DB type.
 * @template D The type of the default value. Inferred from options.default.
 * @template K The key in CommonSettings. Inferred from property name.
 */
function commonSetting<
  V = void, // void resolves to DB type
  D = unknown,
  K extends keyof CommonSettings = keyof CommonSettings,
>(options: CommonSettingOptions<K, D, V extends void ? RequiredCommonSettings[K] : V>) {
  return (target: unknown, propertyKey: K) => {
    type ActualV = V extends void ? RequiredCommonSettings[K] : V;

    Object.defineProperty(target, propertyKey, {
      get(this: Settings): D | ActualV {
        // Convert undefined to default (but not null to default)
        const value = this[getCommonSetting](propertyKey);
        if (value === undefined) {
          return options.default;
        }
        return options.fromDB ? options.fromDB(value) : (value as ActualV);
      },
      set(this: Settings, value: ActualV) {
        const dbValue = options.toDB
          ? options.toDB(value)
          : (value as RequiredCommonSettings[K]);
        this[setCommonSetting](propertyKey, dbValue);
        options.setCallback?.(value);
      },
      enumerable: true,
      configurable: true,
    });
  };
}

/**
 * Settings store singleton
 */
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

  /**
   * Type safe getter for individual _commonSettings values.
   * Unset keys return undefined.
   * @private (uses symbol for sharing with commonSetting decorator)
   */
  [getCommonSetting] = <
    K extends keyof CommonSettings,
    V extends RequiredCommonSettings[K],
  >(
    key: K,
  ): V | undefined => {
    return this._commonSettings.get(key) as V | undefined;
  };

  /**
   * Type safe setter for individual _commonSettings values.
   * Value cannot be undefined.
   * @private (uses symbol for sharing with commonSetting decorator)
   */
  [setCommonSetting] = <
    K extends keyof CommonSettings,
    V extends RequiredCommonSettings[K],
  >(
    key: K,
    value: V,
  ) => {
    this._commonSettings.set(key, value);
  };

  // private resetCommonSetting<K extends keyof CommonSettings>(key: K) {
  //   // Use undefined as tombstone until next merge with existing DB record
  //   this._commonSettings.set(key, undefined);
  // }

  //
  // PWAManager-only reactive settings
  //

  // For PWAManager use only (use pwaManager.allowOfflineUse instead)
  @commonSetting<boolean>({ default: null })
  declare allowOfflineUse: boolean | null;

  // For PWAManager use only (use pwaManager.autoUpdate instead)
  @commonSetting<boolean>({ default: null })
  declare autoUpdate: boolean | null;

  //
  // Public reactive settings
  //

  @commonSetting({
    // TODO: When dark mode no longer experimental:
    //   - change default to "system"
    //   - replace the setCallback with an effect in color-scheme.ts
    default: "light",
    setCallback: (value) => {
      try {
        // Make the value available early for color-scheme-init.ts.
        localStorage.setItem("colorScheme", value);
      } catch {
        // A privacy manager is blocking localStorage. User may see
        // a flash of default colorScheme until script and settings load.
      }
    },
  })
  declare colorScheme: "light" | "dark" | "system";

  private _favoritePuzzles = computed<ReadonlySet<PuzzleId>>(
    () => new Set(this[getCommonSetting]("favoritePuzzles") ?? defaultFavoritePuzzles),
  );

  get favoritePuzzles(): ReadonlySet<PuzzleId> {
    return this._favoritePuzzles.get();
  }

  isFavoritePuzzle(puzzleId: PuzzleId): boolean {
    return this.favoritePuzzles.has(puzzleId);
  }

  setFavoritePuzzle(puzzleId: PuzzleId, isFavorite: boolean) {
    const wasFavorite = this.isFavoritePuzzle(puzzleId);
    if (wasFavorite !== isFavorite) {
      const oldFavorites =
        this[getCommonSetting]("favoritePuzzles") ?? defaultFavoritePuzzles;
      const newFavorites = isFavorite
        ? [...oldFavorites, puzzleId].sort()
        : oldFavorites.filter((id) => id !== puzzleId);
      this[setCommonSetting]("favoritePuzzles", newFavorites);
    }
  }

  @commonSetting({ default: true })
  declare showIntro: boolean;

  @commonSetting({ default: false })
  declare showUnfinishedPuzzles: boolean;

  @commonSetting({ default: false })
  declare showMouseButtonToggle: boolean;

  @commonSetting({ default: true })
  declare rightButtonLongPress: boolean;

  @commonSetting({ default: true })
  declare rightButtonTwoFingerTap: boolean;

  @commonSetting({ default: 40 })
  declare rightButtonAudioVolume: number;

  @commonSetting({ default: 350 })
  declare rightButtonHoldTime: number;

  @commonSetting({ default: 8 })
  declare rightButtonDragThreshold: number;

  @commonSetting({ default: true })
  declare showEndNotification: boolean;

  @commonSetting({ default: true })
  declare showPuzzleKeyboard: boolean;

  @commonSetting({ default: "start" })
  declare statusbarPlacement: "start" | "end" | "hidden";

  @commonSetting({
    default: Number.POSITIVE_INFINITY,
    // Store infinity as null (for json serialization)
    fromDB: (value) => value ?? Number.POSITIVE_INFINITY,
    toDB: (value) => (value === Number.POSITIVE_INFINITY ? null : value),
  })
  declare maxScale: number;

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
    const commonPuzzlePreferences = this[getCommonSetting]("puzzlePreferences");
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
      this[setCommonSetting]("puzzlePreferences", commonPreferences);
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
