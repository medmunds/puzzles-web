import { type Signal, computed, signal } from "@lit-labs/signals";
import { Drawing, type FontInfo } from "./drawing.ts";
import {
  type ChangeNotification,
  type Colour,
  type Drawing as DrawingHandle,
  type Frontend,
  type Point,
  type PuzzleModule,
  type Size,
  loadPuzzleModule,
} from "./module.ts";

// Cleaner types for getConfigItems/setConfigItems
// (emcc-generated <puzzle>.d.ts just uses a big union)
export interface ConfigItemBase {
  type: string;
  label: string;
}
export interface ConfigItemTitle extends ConfigItemBase {
  type: "title";
}
export interface ConfigItemText extends ConfigItemBase {
  type: "text";
  value: string;
}
export interface ConfigItemCheckbox extends ConfigItemBase {
  type: "checkbox";
  value: boolean;
}
export interface ConfigItemSelect extends ConfigItemBase {
  type: "select";
  value: number;
  options: string[];
}
export type ConfigItem =
  | ConfigItemTitle
  | ConfigItemText
  | ConfigItemCheckbox
  | ConfigItemSelect;
export type ConfigItems = ConfigItem[];

export class Puzzle {
  // Puzzles of the same type (on the same page) can share the WASM module
  // (and its heap, etc.). They just need their own midend objects.
  private static puzzleModules: Map<string, WeakRef<PuzzleModule>> = new Map();

  static async create(puzzleId: string) {
    let module = Puzzle.puzzleModules.get(puzzleId)?.deref();
    if (module === undefined) {
      module = await loadPuzzleModule(puzzleId);
      Puzzle.puzzleModules.set(puzzleId, new WeakRef(module));
    }
    return new Puzzle(puzzleId, module);
  }

  public readonly puzzleId: string;

  private readonly _module: PuzzleModule;
  private readonly _frontend: Frontend;
  private _drawing?: Drawing;
  private _drawingHandle?: DrawingHandle;

  // Private constructor; use Puzzle.create(puzzleId) to instantiate a Puzzle.
  private constructor(puzzleId: string, module: PuzzleModule) {
    this.puzzleId = puzzleId;
    this._module = module;
    this._frontend = new module.Frontend({
      activateTimer: this.activateTimer,
      deactivateTimer: this.deactivateTimer,
      textFallback: this.textFallback,
      notifyChange: this.notifyChange,
    });
  }

  async delete() {
    this.deactivateTimer();
    await this.detachCanvas();
    this._frontend.delete();
  }

  notifyChange = async (message: ChangeNotification) => {
    // Callback from C++ Frontend: update signals with provided data.
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
        // TODO: message.usedSolveCommand
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

  get canUndo(): boolean {
    return this._canUndo.get();
  }
  get canRedo(): boolean {
    return this._canRedo.get();
  }
  get isSolved(): boolean {
    return this._isSolved.get();
  }
  get isLost(): boolean {
    return this._isLost.get();
  }
  get currentPresetId(): number | undefined {
    return this._currentPresetId.get();
  }
  get currentParams(): string | undefined {
    return this._currentParams.get();
  }
  get currentGameId(): string | undefined {
    return this._currentGameId.get();
  }
  get randomSeed(): string | undefined {
    return this._randomSeed.get();
  }
  get canFormatAsText(): boolean {
    // TODO: make this reactive (game-state-change?)
    return this._canFormatAsText.get();
  }
  get statusbarText(): string | null {
    return this._statusbarText.get();
  }

  // Static properties (no reactivity needed)
  get canConfigure() {
    return this._frontend.canConfigure;
  }
  get canSolve() {
    return this._frontend.canSolve;
  }
  get displayName() {
    return this._frontend.name;
  }
  get needsRightButton() {
    return this._frontend.needsRightButton;
  }
  get wantsStatusbar() {
    return this._frontend.wantsStatusbar;
  }

  // Methods
  async newGame() {
    this._frontend.newGame();
  }

  async restartGame() {
    this._frontend.restartGame();
  }

  async undo() {
    this._frontend.undo();
  }

  async redo() {
    this._frontend.redo();
  }

  async solve() {
    return this._frontend.solve();
  }

  async setPreset(id: number) {
    this._frontend.setPreset(id);
  }

  async processKey(key: number) {
    return this._frontend.processKey(0, 0, key);
  }

  async processMouse({ x, y }: Point, button: number) {
    return this._frontend.processKey(x, y, button);
  }

  // Pass-through methods that don't change state
  async requestKeys() {
    return this._frontend.requestKeys();
  }
  async getPresets() {
    return this._frontend.getPresets();
  }
  async getConfigItems(which: number): Promise<ConfigItems> {
    return this._frontend.getConfigItems(which);
  }
  async setConfigItems(which: number, items: ConfigItems): Promise<string | undefined> {
    return this._frontend.setConfigItems(which, items);
  }
  async resetTileSize() {
    return this._frontend.resetTileSize();
  }
  async stopAnimation() {
    return this._frontend.stopAnimation();
  }
  async forceRedraw() {
    return this._frontend.forceRedraw();
  }
  async redraw() {
    return this._frontend.redraw();
  }
  async getCursorLocation() {
    return this._frontend.getCursorLocation();
  }
  async getColourPalette(defaultBackground: Colour) {
    return this._frontend.getColourPalette(defaultBackground);
  }
  async freezeTimer(tprop: number) {
    return this._frontend.freezeTimer(tprop);
  }
  async timer(tplus: number) {
    return this._frontend.timer(tplus);
  }
  async size(maxSize: Size, isUserSize: boolean, devicePixelRatio: number) {
    return this._frontend.size(maxSize, isUserSize, devicePixelRatio);
  }
  async formatAsText() {
    return this._frontend.formatAsText();
  }
  async currentKeyLabel(button: number) {
    return this._frontend.currentKeyLabel(button);
  }
  async setGameId(id: string) {
    return this._frontend.setGameId(id);
  }

  //
  // Public API to Drawing
  //

  public async attachCanvas(canvas: OffscreenCanvas, fontInfo: FontInfo) {
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

  public async resizeDrawing({ w, h }: Size, dpr: number) {
    if (!this._drawing) {
      throw new Error("resizeDrawing called with no canvas attached");
    }
    this._drawing.resize(w, h, dpr);
  }

  public async setDrawingPalette(colors: string[]) {
    if (!this._drawing) {
      throw new Error("setDrawingPalette called with no canvas attached");
    }
    this._drawing.setPalette(colors);
  }

  public async setDrawingFontInfo(fontInfo: FontInfo) {
    if (!this._drawing) {
      throw new Error("setDrawingFontInfo called with no canvas attached");
    }
    this._drawing.setFontInfo(fontInfo);
  }

  //
  // Frontend callbacks implementation
  //

  // Pending while timer active; resolves when deactivated
  timerComplete: Promise<void> = Promise.resolve();

  private timerId?: number;
  private lastTimeMs = 0;
  private timerCompleteResolve?: () => void;

  private onAnimationFrame = async (timestampMs: number) => {
    if (this.timerId !== undefined) {
      // puzzle timer requires secs, not msec
      this._frontend.timer((timestampMs - this.lastTimeMs) / 1000);
      this.lastTimeMs = timestampMs;
      this.timerId = window.requestAnimationFrame(this.onAnimationFrame);
    }
  };

  activateTimer = (): void => {
    if (this.timerId === undefined) {
      this.lastTimeMs = globalThis.performance.now();
      this.timerId = window.requestAnimationFrame(this.onAnimationFrame);
      this.timerComplete = new Promise<void>((resolve) => {
        this.timerCompleteResolve = resolve;
      });
    }
  };

  deactivateTimer = (): void => {
    if (this.timerId !== undefined) {
      window.cancelAnimationFrame(this.timerId);
      this.timerId = undefined;
      this.timerCompleteResolve?.();
      this.timerCompleteResolve = undefined;
    }
  };

  textFallback = (strings: string[]): string => {
    // Probably any Unicode string can be rendered, so use the preferred one.
    return strings[0];
  };
}
