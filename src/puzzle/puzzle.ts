import { type Signal, computed, signal } from "@lit-labs/signals";
import createModule from "../assets/puzzles/emcc-runtime";
import { Drawing } from "./drawing.ts";
import type {
  ChangeNotification,
  Colour,
  ConfigItems,
  Drawing as DrawingHandle,
  FontInfo,
  Frontend,
  FrontendConstructorArgs,
  KeyLabel,
  Point,
  PresetMenuEntry,
  PuzzleModule,
  PuzzleStaticAttributes,
  Size,
} from "./types.ts";

/**
 * Public API to the WASM puzzle module.
 * Exposes reactive properties for puzzle state.
 * Exposes async methods for calling WASM Frontend APIs.
 * Mediates handoff of OffscreenCanvas to the Drawing object.
 */
export class Puzzle {
  public static async create(puzzleId: string): Promise<Puzzle> {
    // (Module initialization and querying static properties moves to worker.
    // Static property values should be passed to main thread with worker's
    // response to "createPuzzle" call.)
    const module = await loadPuzzleModule(puzzleId);
    const puzzle = new Puzzle(puzzleId, module);
    await puzzle.initStaticProperties({
      displayName: puzzle._frontend.name,
      canConfigure: puzzle._frontend.canConfigure,
      canSolve: puzzle._frontend.canSolve,
      needsRightButton: puzzle._frontend.needsRightButton,
      wantsStatusbar: puzzle._frontend.wantsStatusbar,
    });
    return puzzle;
  }

  public readonly puzzleId: string;

  private readonly _module: PuzzleModule;
  private readonly _frontend: Frontend;
  private readonly _frontendCallbacks: FrontendCallbacks;
  private _drawing?: Drawing;
  private _drawingHandle?: DrawingHandle;

  // Private constructor; use Puzzle.create(puzzleId) to instantiate a Puzzle.
  private constructor(puzzleId: string, module: PuzzleModule) {
    this.puzzleId = puzzleId;
    this._module = module;
    this._frontendCallbacks = new FrontendCallbacks(
      this.serviceTimer,
      this.notifyTimerState,
    );
    this._frontend = new module.Frontend({
      activateTimer: this._frontendCallbacks.activateTimer,
      deactivateTimer: this._frontendCallbacks.deactivateTimer,
      textFallback: this._frontendCallbacks.textFallback,
      notifyChange: this.notifyChange,
    });
  }

  public async delete(): Promise<void> {
    await this.detachCanvas();
    this._frontend.delete();
  }

  private async initStaticProperties({
    displayName,
    canConfigure,
    canSolve,
    needsRightButton,
    wantsStatusbar,
  }: PuzzleStaticAttributes): Promise<void> {
    this.displayName = displayName;
    this.canConfigure = canConfigure;
    this.canSolve = canSolve;
    this.needsRightButton = needsRightButton;
    this.wantsStatusbar = wantsStatusbar;
  }

  private notifyChange = async (message: ChangeNotification) => {
    // Callback from C++ Frontend: update signals with provided data.
    // (Runs in main thread; message could originate in a worker.)
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
        update(this._canUndo, message.canUndo);
        update(this._canRedo, message.canRedo);
        update(this._isSolved, message.isSolved);
        update(this._isLost, message.isLost);
        // TODO: usedSolveCommand
        // TODO: canFormatAsText
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
  public displayName = "";
  public canConfigure = false;
  public canSolve = false;
  public needsRightButton = false;
  public wantsStatusbar = false;

  // Reactive properties
  private _canUndo = signal(false);
  private _canRedo = signal(false);
  private _isSolved = signal(false);
  private _isLost = signal(false);
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

  public get canUndo(): boolean {
    return this._canUndo.get();
  }

  public get canRedo(): boolean {
    return this._canRedo.get();
  }

  public get isSolved(): boolean {
    return this._isSolved.get();
  }

  public get isLost(): boolean {
    return this._isLost.get();
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
    this._frontend.newGame();
  }

  public async restartGame(): Promise<void> {
    this._frontend.restartGame();
  }

  public async undo(): Promise<void> {
    this._frontend.undo();
  }

  public async redo(): Promise<void> {
    this._frontend.redo();
  }

  public async solve(): Promise<string | undefined> {
    return this._frontend.solve();
  }

  public async setPreset(id: number): Promise<void> {
    this._frontend.setPreset(id);
  }

  public async processKey(key: number): Promise<boolean> {
    return this._frontend.processKey(0, 0, key);
  }

  public async processMouse({ x, y }: Point, button: number): Promise<boolean> {
    return this._frontend.processKey(x, y, button);
  }

  public async requestKeys(): Promise<KeyLabel[]> {
    return this._frontend.requestKeys();
  }

  public async getPresets(): Promise<PresetMenuEntry[]> {
    return this._frontend.getPresets();
  }

  public async getConfigItems(which: number): Promise<ConfigItems> {
    return this._frontend.getConfigItems(which);
  }

  public async setConfigItems(
    which: number,
    items: ConfigItems,
  ): Promise<string | undefined> {
    return this._frontend.setConfigItems(which, items);
  }

  public async redraw(): Promise<void> {
    return this._frontend.redraw();
  }

  public async getColourPalette(defaultBackground: Colour): Promise<Colour[]> {
    return this._frontend.getColourPalette(defaultBackground);
  }

  public async size(
    maxSize: Size,
    isUserSize: boolean,
    devicePixelRatio: number,
  ): Promise<Size> {
    return this._frontend.size(maxSize, isUserSize, devicePixelRatio);
  }

  public async formatAsText(): Promise<string | undefined> {
    return this._frontend.formatAsText();
  }

  public async setGameId(id: string): Promise<string | undefined> {
    return this._frontend.setGameId(id);
  }

  //
  // Public API to Drawing
  //

  public async attachCanvas(
    canvas: OffscreenCanvas,
    fontInfo: FontInfo,
  ): Promise<void> {
    if (this._drawing) {
      throw new Error("attachCanvas called with another canvas already attached");
    }
    this._drawing = new Drawing(canvas, fontInfo);
    this._drawingHandle = this._drawing.bind(this._module);
    this._frontend.setDrawing(this._drawingHandle);
  }

  public async detachCanvas(): Promise<void> {
    if (this._drawing) {
      this._frontend.setDrawing(null);
      this._drawingHandle?.delete();
      this._drawingHandle = undefined;
      this._drawing = undefined;
    }
  }

  public async resizeDrawing({ w, h }: Size, dpr: number): Promise<void> {
    if (!this._drawing) {
      throw new Error("resizeDrawing called with no canvas attached");
    }
    this._drawing.resize(w, h, dpr);
  }

  public async setDrawingPalette(colors: string[]): Promise<void> {
    if (!this._drawing) {
      throw new Error("setDrawingPalette called with no canvas attached");
    }
    this._drawing.setPalette(colors);
  }

  public async setDrawingFontInfo(fontInfo: FontInfo): Promise<void> {
    if (!this._drawing) {
      throw new Error("setDrawingFontInfo called with no canvas attached");
    }
    this._drawing.setFontInfo(fontInfo);
  }

  //
  // Timer state
  //

  // Pending while timer active; resolves when deactivated
  public timerComplete: Promise<void> = Promise.resolve();
  private timerCompleteResolve?: () => void;

  // (handle notification from worker to update timerComplete promise)
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

  // (moves to worker)
  private serviceTimer = (tplus: number) => {
    this._frontend.timer(tplus);
  };
}

// Puzzles of the same type (on the same page) can share the WASM module
// (and its heap, etc.). And a single worker can service all puzzleModules.
const puzzleModuleCache: Map<string, WeakRef<PuzzleModule>> = new Map();

/**
 * Load a wasm puzzle module for puzzleId.
 * (Moves to worker.)
 */
async function loadPuzzleModule(puzzleId: string): Promise<PuzzleModule> {
  let module = puzzleModuleCache.get(puzzleId)?.deref();

  if (module === undefined) {
    // Point the shared emcc runtime to the desired puzzle.wasm
    module = await createModule({
      locateFile: () =>
        new URL(`../assets/puzzles/${puzzleId}.wasm`, import.meta.url).href,
    });
    puzzleModuleCache.set(puzzleId, new WeakRef(module));
  }

  return module;
}

/**
 * Frontend callbacks implementation.
 * (Moves to worker.)
 */
class FrontendCallbacks implements Omit<FrontendConstructorArgs, "notifyChange"> {
  constructor(
    private readonly serviceTimer: Frontend["timer"],
    private readonly notifyTimerState: (isActive: boolean) => void,
  ) {}

  private timerId?: number;
  private lastTimeMs = 0;

  private onAnimationFrame = async (timestampMs: number) => {
    if (this.timerId !== undefined) {
      // puzzle timer requires secs, not msec
      this.serviceTimer((timestampMs - this.lastTimeMs) / 1000);
      this.lastTimeMs = timestampMs;
      this.timerId = globalThis.requestAnimationFrame(this.onAnimationFrame);
    }
  };

  activateTimer = (): void => {
    if (this.timerId === undefined) {
      this.lastTimeMs = globalThis.performance.now();
      this.timerId = globalThis.requestAnimationFrame(this.onAnimationFrame);
      this.notifyTimerState(true);
    }
  };

  deactivateTimer = (): void => {
    if (this.timerId !== undefined) {
      globalThis.cancelAnimationFrame(this.timerId);
      this.timerId = undefined;
      this.notifyTimerState(false);
    }
  };

  textFallback = (strings: string[]): string => {
    // Probably any Unicode string can be rendered, so use the preferred one.
    return strings[0];
  };
}
