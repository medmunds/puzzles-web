import * as Comlink from "comlink";
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
 * Worker-side puzzle implementation that handles all WASM operations.
 */
export class WorkerPuzzle implements FrontendConstructorArgs {
  static async create(puzzleId: string): Promise<WorkerPuzzle> {
    const module = await createModule({
      locateFile: () =>
        new URL(`../assets/puzzles/${puzzleId}.wasm`, import.meta.url).href,
    });
    return new WorkerPuzzle(puzzleId, module);
  }

  readonly puzzleId: string;

  private readonly _module: PuzzleModule;
  private readonly _frontend: Frontend;
  private _drawing?: Drawing;
  private _drawingHandle?: DrawingHandle;

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

  // Comlink callbacks to main thread
  private _earlyChangeNotifications: ChangeNotification[] = [];
  private _notifyChange?: (message: ChangeNotification) => void;
  private _notifyTimerState?: (isActive: boolean) => void;

  setCallbacks(
    notifyChange: (message: ChangeNotification) => void,
    notifyTimerState: (isActive: boolean) => void,
  ) {
    this._notifyChange = notifyChange;
    this._notifyTimerState = notifyTimerState;

    // Deliver any change notifications that were received prior to setCallbacks.
    // (There shouldn't be early timer state changes.)
    for (const message of this._earlyChangeNotifications) {
      this._notifyChange(message);
    }
    this._earlyChangeNotifications = [];
  }

  delete(): void {
    this.detachCanvas();
    this._frontend.delete();
  }

  getStaticProperties(): PuzzleStaticAttributes {
    return {
      displayName: this._frontend.name,
      canConfigure: this._frontend.canConfigure,
      canSolve: this._frontend.canSolve,
      needsRightButton: this._frontend.needsRightButton,
      wantsStatusbar: this._frontend.wantsStatusbar,
    };
  }

  // All the puzzle methods
  newGame(): void {
    this._frontend.newGame();
  }

  restartGame(): void {
    this._frontend.restartGame();
  }

  undo(): void {
    this._frontend.undo();
  }

  redo(): void {
    this._frontend.redo();
  }

  solve(): string | undefined {
    return this._frontend.solve();
  }

  setPreset(id: number): void {
    this._frontend.setPreset(id);
  }

  processKey(key: number): boolean {
    return this._frontend.processKey(0, 0, key);
  }

  processMouse({ x, y }: Point, button: number): boolean {
    return this._frontend.processKey(x, y, button);
  }

  requestKeys(): KeyLabel[] {
    return this._frontend.requestKeys();
  }

  getPresets(): PresetMenuEntry[] {
    return this._frontend.getPresets();
  }

  getConfigItems(which: number): ConfigItems {
    return this._frontend.getConfigItems(which);
  }

  setConfigItems(which: number, items: ConfigItems): string | undefined {
    return this._frontend.setConfigItems(which, items);
  }

  redraw(): void {
    this._frontend.redraw();
  }

  getColourPalette(defaultBackground: Colour): Colour[] {
    return this._frontend.getColourPalette(defaultBackground);
  }

  size(maxSize: Size, isUserSize: boolean, devicePixelRatio: number): Size {
    return this._frontend.size(maxSize, isUserSize, devicePixelRatio);
  }

  formatAsText(): string | undefined {
    return this._frontend.formatAsText();
  }

  setGameId(id: string): string | undefined {
    return this._frontend.setGameId(id);
  }

  //
  // Drawing methods
  //

  attachCanvas(canvas: OffscreenCanvas, fontInfo: FontInfo): void {
    if (this._drawing) {
      throw new Error("attachCanvas called with another canvas already attached");
    }
    this._drawing = new Drawing(canvas, fontInfo);
    this._drawingHandle = this._drawing.bind(this._module);
    this._frontend.setDrawing(this._drawingHandle);
  }

  detachCanvas(): void {
    if (this._drawing) {
      this._frontend.setDrawing(null);
      this._drawingHandle?.delete();
      this._drawingHandle = undefined;
      this._drawing = undefined;
    }
  }

  resizeDrawing({ w, h }: Size, dpr: number): void {
    if (!this._drawing) {
      throw new Error("resizeDrawing called with no canvas attached");
    }
    this._drawing.resize(w, h, dpr);
  }

  setDrawingPalette(colors: string[]): void {
    if (!this._drawing) {
      throw new Error("setDrawingPalette called with no canvas attached");
    }
    this._drawing.setPalette(colors);
  }

  setDrawingFontInfo(fontInfo: FontInfo): void {
    if (!this._drawing) {
      throw new Error("setDrawingFontInfo called with no canvas attached");
    }
    this._drawing.setFontInfo(fontInfo);
  }

  //
  // Timer
  //

  private timerId?: number;
  private lastTimeMs = 0;

  private onAnimationFrame = async (timestampMs: number) => {
    if (this.timerId !== undefined) {
      // puzzle timer requires secs, not msec
      this._frontend.timer((timestampMs - this.lastTimeMs) / 1000);
      this.lastTimeMs = timestampMs;
      this.timerId = self.requestAnimationFrame(this.onAnimationFrame);
    }
  };

  //
  // Frontend callbacks
  //

  activateTimer = (): void => {
    if (this.timerId === undefined) {
      this.lastTimeMs = self.performance.now();
      this.timerId = self.requestAnimationFrame(this.onAnimationFrame);
      this._notifyTimerState?.(true);
    }
  };

  deactivateTimer = (): void => {
    if (this.timerId !== undefined) {
      self.cancelAnimationFrame(this.timerId);
      this.timerId = undefined;
      this._notifyTimerState?.(false);
    }
  };

  textFallback = (strings: string[]): string => {
    // Probably any Unicode string can be rendered, so use the preferred one.
    return strings[0];
  };

  notifyChange = (message: ChangeNotification): void => {
    if (this._notifyChange) {
      this._notifyChange(message);
    } else {
      // Early notification before main thread has installed callbacks
      // (e.g., initial state in Frontend constructor). Queue for delivery
      // when callbacks installed.
      this._earlyChangeNotifications.push(message);
    }
  };
}

// Factory function to create puzzle instances
interface WorkerPuzzleFactory {
  create(puzzleId: string): Promise<WorkerPuzzle>;
}
const workerPuzzleFactory: WorkerPuzzleFactory = {
  async create(puzzleId: string) {
    const workerPuzzle = await WorkerPuzzle.create(puzzleId);
    return Comlink.proxy(workerPuzzle);
  },
};

Comlink.expose(workerPuzzleFactory);

type ComlinkRemoteFactory<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => Promise<infer R>
    ? (...args: A) => Promise<Comlink.Remote<R>>
    : T[K];
};

export type RemoteWorkerPuzzle = Comlink.Remote<WorkerPuzzle>;
export type RemoteWorkerPuzzleFactory = ComlinkRemoteFactory<WorkerPuzzleFactory>;
