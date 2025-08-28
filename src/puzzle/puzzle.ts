import { computed, type Signal, signal } from "@lit-labs/signals";
import * as Sentry from "@sentry/browser";
import * as Comlink from "comlink";
import { transfer } from "comlink";
import {
  installWorkerErrorReceivers,
  uninstallWorkerErrorReceivers,
} from "../utils/errors.ts";
import { nextAnimationFrame } from "../utils/timing.ts";
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

const sentryWebWorkerIntegration = import.meta.env.VITE_SENTRY_DSN
  ? Sentry.webWorkerIntegration({ worker: [] })
  : null;
if (sentryWebWorkerIntegration) {
  Sentry.addIntegration(sentryWebWorkerIntegration);
}

/**
 * Public API to the remote WASM puzzle module running in a worker.
 * Exposes reactive properties for puzzle state.
 * Exposes async methods for calling WASM Frontend APIs.
 */
export class Puzzle {
  public static async create(puzzleId: string): Promise<Puzzle> {
    if (import.meta.env.VITE_SENTRY_DSN) {
      Sentry.setTag("puzzleId", puzzleId);
    }
    const worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
      name: `puzzle-worker-${puzzleId}`,
    });
    sentryWebWorkerIntegration?.addWorker(worker);
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
      isTimed,
      wantsStatusbar,
    }: PuzzleStaticAttributes,
  ) {
    this.displayName = displayName;
    this.canConfigure = canConfigure;
    this.canSolve = canSolve;
    this.needsRightButton = needsRightButton;
    this.isTimed = isTimed;
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
        if (import.meta.env.VITE_SENTRY_DSN) {
          Sentry.setContext("Puzzle", {
            puzzleId: this.puzzleId,
            gameId: message.currentGameId,
            randomSeed: message.randomSeed,
          });
        }
        update(this._currentGameId, message.currentGameId);
        update(this._randomSeed, message.randomSeed);
        break;
      }
      case "game-state-change":
        this.purgeInvalidCheckpoints(message.totalMoves);
        update(this._status, message.status);
        update(this._currentMove, message.currentMove);
        update(this._totalMoves, message.totalMoves);
        update(this._canUndo, message.canUndo);
        update(this._canRedo, message.canRedo);
        break;
      case "params-change":
        update(this._params, message.params);
        break;
      case "status-bar-change":
        update(this._statusbarText, message.statusBarText);
        break;
      default:
        // @ts-expect-error: message.type never
        throw new Error(`Unknown notifyChange type ${message.type}`);
    }
  };

  // Static properties (no reactivity needed)
  public readonly displayName: string;
  public readonly canConfigure: boolean;
  public readonly canSolve: boolean;
  public readonly needsRightButton: boolean;
  public readonly isTimed: boolean;
  public readonly wantsStatusbar: boolean;

  // Reactive properties
  private _status = signal<GameStatus>("ongoing");
  private _currentMove = signal<number>(0);
  private _totalMoves = signal<number>(0);
  private _canUndo = signal(false);
  private _canRedo = signal(false);
  private _params = signal<string>("");
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
  private _generatingGame = signal<boolean>(false);

  public get status(): GameStatus {
    return this._status.get();
  }

  public get isSolved(): boolean {
    return this.status === "solved" || this.status === "solved-with-help";
  }

  public get currentMove(): number {
    return this._currentMove.get();
  }

  public get totalMoves(): number {
    return this._totalMoves.get();
  }

  public get canUndo(): boolean {
    return this._canUndo.get();
  }

  public get canRedo(): boolean {
    return this._canRedo.get();
  }

  // The encoded game params that will be used for the next "new game".
  public get params(): string {
    return this._params.get();
  }

  // The encoded game params in effect for the current game.
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

  public get generatingGame(): boolean {
    return this._generatingGame.get();
  }

  // Methods
  public async newGame(): Promise<void> {
    this._generatingGame.set(true);
    await this.workerPuzzle.newGame();
    this._generatingGame.set(false);
  }

  public async newGameFromId(id: string): Promise<string | undefined> {
    return this.workerPuzzle.newGameFromId(id);
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
    return this.workerPuzzle.solve();
  }

  public async processKey(key: number): Promise<boolean> {
    return this.workerPuzzle.processKey(key);
  }

  public async processMouse({ x, y }: Point, button: number): Promise<boolean> {
    return this.workerPuzzle.processMouse({ x, y }, button);
  }

  public async requestKeys(): Promise<KeyLabel[]> {
    return this.workerPuzzle.requestKeys();
  }

  public async getParams(): Promise<string> {
    return this.workerPuzzle.getParams();
  }

  public async setParams(params: string): Promise<string | undefined> {
    return this.workerPuzzle.setParams(params);
  }

  public async getParamsDescription(params: string): Promise<string | undefined> {
    const presets = await this.getPresets(true);
    return presets.find((preset) => preset.params === params)?.title;
  }

  public async getPresets(flat = false): Promise<PresetMenuEntry[]> {
    let presets = await this.workerPuzzle.getPresets();
    if (flat) {
      const flatten = (items: PresetMenuEntry[]): PresetMenuEntry[] => {
        return items.flatMap((item) => [
          item,
          ...(item.submenu ? flatten(item.submenu) : []),
        ]);
      };
      presets = flatten(presets);
    }
    return presets;
  }

  public async getCustomParamsConfig(): Promise<ConfigDescription> {
    return this.workerPuzzle.getCustomParamsConfig();
  }

  public async getCustomParams(): Promise<ConfigValues> {
    return this.workerPuzzle.getCustomParams();
  }

  public async setCustomParams(values: ConfigValues): Promise<string | undefined> {
    return this.workerPuzzle.setCustomParams(values);
  }

  public async encodeCustomParams(values: ConfigValues): Promise<string> {
    return this.workerPuzzle.encodeCustomParams(values);
  }

  public async getPreferencesConfig(): Promise<ConfigDescription> {
    return this.workerPuzzle.getPreferencesConfig();
  }

  public async getPreferences(): Promise<ConfigValues> {
    return this.workerPuzzle.getPreferences();
  }

  public async savePreferences(): Promise<Uint8Array> {
    return this.workerPuzzle.savePreferences();
  }

  public async loadPreferences(data: Uint8Array): Promise<string | undefined> {
    return this.workerPuzzle.loadPreferences(transfer(data, [data.buffer]));
  }

  public async setPreferences(values: ConfigValues): Promise<string | undefined> {
    return this.workerPuzzle.setPreferences(values);
  }

  public async redraw(): Promise<void> {
    if (!this.hasSize) {
      // "Some back ends require that midend_size() is called before midend_redraw()."
      console.error("Ignoring Puzzle.redraw() called before Puzzle.size()");
      return;
    }
    await this.workerPuzzle.redraw();
  }

  public async getColourPalette(defaultBackground: Colour): Promise<Colour[]> {
    return this.workerPuzzle.getColourPalette(defaultBackground);
  }

  // Whether size() has been successfully called yet.
  private hasSize = false;

  public async size(
    maxSize: Size,
    isUserSize: boolean,
    devicePixelRatio: number,
  ): Promise<Size> {
    if (!this.currentGameId) {
      // "The midend relies on the frontend calling midend_new_game() before calling
      // midend_size()." (Or otherwise having a game, e.g., midend_deserialise().)
      console.error("Ignoring Puzzle.size() called before game initialized");
      return maxSize;
    }
    const result = await this.workerPuzzle.size(maxSize, isUserSize, devicePixelRatio);
    this.hasSize = true;
    return result;
  }

  public async formatAsText(): Promise<string | undefined> {
    return this.workerPuzzle.formatAsText();
  }

  public async loadGame(data: Uint8Array<ArrayBuffer>): Promise<string | undefined> {
    return this.workerPuzzle.loadGame(transfer(data, [data.buffer]));
  }

  public async saveGame(): Promise<Uint8Array<ArrayBuffer>> {
    return this.workerPuzzle.saveGame();
  }

  //
  // Checkpoints
  //

  private _checkpoints = signal<ReadonlySet<number>>(new Set());

  /**
   * A set of move numbers that have been set as checkpoints.
   */
  get checkpoints(): ReadonlySet<number> {
    return this._checkpoints.get();
  }

  set checkpoints(value: Iterable<number>) {
    this._checkpoints.set(new Set(value));
  }

  /**
   * Set a checkpoint at move (default the current move).
   */
  public addCheckpoint(move?: number) {
    const checkpoint = move ?? this.currentMove;
    if (!this.checkpoints.has(checkpoint)) {
      // TODO: use reactive set (from signal-utils) rather than replacing value
      const newCheckpoints = new Set(this.checkpoints);
      newCheckpoints.add(checkpoint);
      this._checkpoints.set(newCheckpoints);
    }
  }

  /**
   * Remove checkpoint if it exists
   */
  public removeCheckpoint(checkpoint: number) {
    if (this.checkpoints.has(checkpoint)) {
      // TODO: use reactive set (from signal-utils) rather than replacing value
      const newCheckpoints = new Set(this.checkpoints);
      newCheckpoints.delete(checkpoint);
      this._checkpoints.set(newCheckpoints);
    }
  }

  /**
   * Wind the game forward/backward to move number checkpoint.
   * (Checkpoint can actually be any valid move number,
   * and does not have to have been saved as a checkpoint.)
   */
  public async goToCheckpoint(checkpoint: number): Promise<void> {
    if (checkpoint < 0 || checkpoint > this.totalMoves) {
      throw new RangeError(`Move ${checkpoint} out of bounds`);
    }
    const delta = checkpoint - this.currentMove;
    if (delta < 0) {
      for (let i = 0; i < -delta; i++) {
        await this.undo();
      }
    } else if (delta > 0) {
      for (let i = 0; i < delta; i++) {
        await this.redo();
      }
    }
  }

  private purgeInvalidCheckpoints(totalMoves: number) {
    // Called before updating this.currentMove and this.totalMoves.
    // Prune any checkpoints past new totalMoves.
    if (totalMoves < this.totalMoves && this.checkpoints.size > 0) {
      // TODO: use reactive set (from signal-utils) rather than replacing value
      const newCheckpoints = new Set(this.checkpoints);
      for (const checkpoint of newCheckpoints) {
        // BUG: this can't distinguish these two cases:
        //   - set checkpoint; undo; redo (shouldn't purge checkpoint == totalMoves)
        //   - set checkpoint; undo; move (_should_ purge checkpoint >= totalMoves)
        // To avoid unexpected purging, use `>` rather than `>=`:
        if (checkpoint > totalMoves) {
          newCheckpoints.delete(checkpoint);
        }
      }
      if (newCheckpoints.size < this.checkpoints.size) {
        this._checkpoints.set(newCheckpoints);
      }
    }
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
    // Delay one frame to avoid a problem in Safari and Firefox where the
    // onscreen canvas initially (and somewhat randomly) appears solid black
    // or solid background color. (Seems like drawing to the offscreen canvas
    // immediately after transfer to the worker doesn't make it back onscreen.)
    await nextAnimationFrame();
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
