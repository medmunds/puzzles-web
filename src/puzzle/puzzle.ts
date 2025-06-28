import { type Signal, computed, signal } from "@lit-labs/signals";
import * as Comlink from "comlink";
import {
  installWorkerErrorReceivers,
  uninstallWorkerErrorReceivers,
} from "../utils/errors.ts";
import type {
  ChangeNotification,
  Colour,
  ConfigDescription,
  ConfigValues,
  FontInfo,
  GameStatus,
  KeyLabel,
  Point,
  PresetMenuEntry,
  PuzzleStaticAttributes,
  Size,
} from "./types.ts";
import type { RemoteWorkerPuzzle, RemoteWorkerPuzzleFactory } from "./worker.ts";

/**
 * Public API to the remote WASM puzzle module running in a worker.
 * Exposes reactive properties for puzzle state.
 * Exposes async methods for calling WASM Frontend APIs.
 */
export class Puzzle {
  public static async create(puzzleId: string): Promise<Puzzle> {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
      name: `puzzle-worker-${puzzleId}`,
    });
    installWorkerErrorReceivers(worker);
    const workerFactory = Comlink.wrap<RemoteWorkerPuzzleFactory>(worker);
    const workerPuzzle = await workerFactory.create(puzzleId);

    const staticProps = await workerPuzzle.getStaticProperties();
    const puzzle = new Puzzle(puzzleId, worker, workerPuzzle, staticProps);
    await puzzle.initialize();
    return puzzle;
  }

  // Private constructor; use Puzzle.create(puzzleId) to instantiate a Puzzle.
  private constructor(
    public readonly puzzleId: string,
    private readonly worker: Worker,
    private readonly workerPuzzle: RemoteWorkerPuzzle,
    {
      displayName,
      canConfigure,
      canSolve,
      needsRightButton,
      wantsStatusbar,
    }: PuzzleStaticAttributes,
  ) {
    this.displayName = displayName;
    this.canConfigure = canConfigure;
    this.canSolve = canSolve;
    this.needsRightButton = needsRightButton;
    this.wantsStatusbar = wantsStatusbar;
  }

  private async initialize(): Promise<void> {
    await this.workerPuzzle.setCallbacks(
      Comlink.proxy(this.notifyChange),
      Comlink.proxy(this.notifyTimerState),
    );
  }

  public async delete(): Promise<void> {
    await this.detachCanvas();
    await this.workerPuzzle.delete();
    this.workerPuzzle[Comlink.releaseProxy]();
    uninstallWorkerErrorReceivers(this.worker);
    this.worker.terminate();
  }

  private notifyChange = async (message: ChangeNotification) => {
    // Callback from C++ Frontend: update signals with provided data.
    // (Message originates in worker.)
    function update<T>(signal: Signal.State<T>, newValue: T) {
      if (signal.get() !== newValue) {
        signal.set(newValue);
      }
    }

    switch (message.type) {
      case "game-id-change": {
        update(this._currentGameId, message.currentGameId);
        update(this._randomSeed, message.randomSeed);
        break;
      }
      case "game-state-change":
        update(this._status, message.status);
        update(this._canUndo, message.canUndo);
        update(this._canRedo, message.canRedo);
        break;
      case "preset-id-change":
        update(this._currentPresetId, message.presetId);
        break;
      case "status-bar-change":
        update(this._statusbarText, message.statusBarText);
        break;
      default:
        // @ts-ignore: message.type never
        throw new Error(`Unknown notifyChange type ${message.type}`);
    }
  };

  // Static properties (no reactivity needed)
  public readonly displayName: string;
  public readonly canConfigure: boolean;
  public readonly canSolve: boolean;
  public readonly needsRightButton: boolean;
  public readonly wantsStatusbar: boolean;

  // Reactive properties
  private _status = signal<GameStatus>("ongoing");
  private _canUndo = signal(false);
  private _canRedo = signal(false);
  private _currentPresetId = signal<number | undefined>(undefined);
  private _currentParams = computed<string | undefined>(
    () =>
      // The encoded params are in randomSeed before '#' and currentGameId before ':'.
      // The randomSeed version is more descriptive if available (e.g, includes difficulty).
      this.randomSeed?.split("#", 1).at(0) ?? this.currentGameId?.split(":", 1).at(0),
  );
  private _currentGameId = signal<string | undefined>(undefined);
  private _randomSeed = signal<string | undefined>(undefined);
  private _canFormatAsText = signal(false);
  private _statusbarText = signal<string>("");

  public get status(): GameStatus {
    return this._status.get();
  }

  public get canUndo(): boolean {
    return this._canUndo.get();
  }

  public get canRedo(): boolean {
    return this._canRedo.get();
  }

  public get currentPresetId(): number | undefined {
    return this._currentPresetId.get();
  }

  public get currentParams(): string | undefined {
    return this._currentParams.get();
  }

  public get currentGameId(): string | undefined {
    return this._currentGameId.get();
  }

  public get randomSeed(): string | undefined {
    return this._randomSeed.get();
  }

  public get canFormatAsText(): boolean {
    return this._canFormatAsText.get();
  }

  public get statusbarText(): string | null {
    return this._statusbarText.get();
  }

  // Methods
  public async newGame(): Promise<void> {
    await this.workerPuzzle.newGame();
  }

  public async restartGame(): Promise<void> {
    await this.workerPuzzle.restartGame();
  }

  public async undo(): Promise<void> {
    await this.workerPuzzle.undo();
  }

  public async redo(): Promise<void> {
    await this.workerPuzzle.redo();
  }

  public async solve(): Promise<string | undefined> {
    return await this.workerPuzzle.solve();
  }

  public async setPreset(id: number): Promise<void> {
    await this.workerPuzzle.setPreset(id);
  }

  public async processKey(key: number): Promise<boolean> {
    return await this.workerPuzzle.processKey(key);
  }

  public async processMouse({ x, y }: Point, button: number): Promise<boolean> {
    return await this.workerPuzzle.processMouse({ x, y }, button);
  }

  public async requestKeys(): Promise<KeyLabel[]> {
    return await this.workerPuzzle.requestKeys();
  }

  public async getPresets(): Promise<PresetMenuEntry[]> {
    return await this.workerPuzzle.getPresets();
  }

  public async getCustomParamsConfig(): Promise<ConfigDescription> {
    return await this.workerPuzzle.getCustomParamsConfig();
  }

  public async getCustomParams(): Promise<ConfigValues> {
    return await this.workerPuzzle.getCustomParams();
  }

  public async setCustomParams(values: ConfigValues): Promise<string | undefined> {
    return await this.workerPuzzle.setCustomParams(values);
  }

  public async getPreferencesConfig(): Promise<ConfigDescription> {
    return await this.workerPuzzle.getPreferencesConfig();
  }

  public async getPreferences(): Promise<ConfigValues> {
    return await this.workerPuzzle.getPreferences();
  }

  public async setPreferences(values: ConfigValues): Promise<string | undefined> {
    return await this.workerPuzzle.setPreferences(values);
  }

  public async redraw(): Promise<void> {
    await this.workerPuzzle.redraw();
  }

  public async getColourPalette(defaultBackground: Colour): Promise<Colour[]> {
    return await this.workerPuzzle.getColourPalette(defaultBackground);
  }

  public async size(
    maxSize: Size,
    isUserSize: boolean,
    devicePixelRatio: number,
  ): Promise<Size> {
    return await this.workerPuzzle.size(maxSize, isUserSize, devicePixelRatio);
  }

  public async formatAsText(): Promise<string | undefined> {
    return await this.workerPuzzle.formatAsText();
  }

  public async setGameId(id: string): Promise<string | undefined> {
    return await this.workerPuzzle.setGameId(id);
  }

  //
  // Public API to Drawing
  //

  public async attachCanvas(
    canvas: OffscreenCanvas,
    fontInfo: FontInfo,
  ): Promise<void> {
    // Transfer the canvas to the worker
    await this.workerPuzzle.attachCanvas(Comlink.transfer(canvas, [canvas]), fontInfo);
  }

  public async detachCanvas(): Promise<void> {
    await this.workerPuzzle.detachCanvas();
  }

  public async resizeDrawing({ w, h }: Size, dpr: number): Promise<void> {
    await this.workerPuzzle.resizeDrawing({ w, h }, dpr);
  }

  public async setDrawingPalette(colors: string[]): Promise<void> {
    await this.workerPuzzle.setDrawingPalette(colors);
  }

  public async setDrawingFontInfo(fontInfo: FontInfo): Promise<void> {
    await this.workerPuzzle.setDrawingFontInfo(fontInfo);
  }

  //
  // Timer state
  //

  // Pending while timer active; resolves when deactivated
  public timerComplete: Promise<void> = Promise.resolve();
  private timerCompleteResolve?: () => void;

  private notifyTimerState = (isActive: boolean) => {
    // Resolve the current activation (if any)
    this.timerCompleteResolve?.();
    this.timerCompleteResolve = undefined;
    if (isActive) {
      // Start a new activation cycle
      this.timerComplete = new Promise<void>((resolve) => {
        this.timerCompleteResolve = resolve;
      });
    }
  };
}
