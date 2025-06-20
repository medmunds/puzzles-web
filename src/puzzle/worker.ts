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
 * Worker-side implementation of main-thread Puzzle class
 */
export class WorkerPuzzle implements FrontendConstructorArgs {
  static async create(puzzleId: string): Promise<WorkerPuzzle> {
    const module = await createModule({
      locateFile: () =>
        new URL(`../assets/puzzles/${puzzleId}.wasm`, import.meta.url).href,
    });
    return new WorkerPuzzle(puzzleId, module);
  }

  private readonly frontend: Frontend;

  private constructor(
    public readonly puzzleId: string,
    private readonly module: PuzzleModule,
  ) {
    this.frontend = new module.Frontend({
      activateTimer: this.activateTimer,
      deactivateTimer: this.deactivateTimer,
      textFallback: this.textFallback,
      notifyChange: this.notifyChange,
    });
  }

  delete(): void {
    this.detachCanvas();
    this.frontend.delete();
  }

  //
  // Remote callbacks (to main thread via Comlink)
  //

  private earlyChangeNotifications: ChangeNotification[] = [];
  private notifyChangeRemote?: (message: ChangeNotification) => void;
  private notifyTimerStateRemote?: (isActive: boolean) => void;

  setCallbacks(
    notifyChange: (message: ChangeNotification) => void,
    notifyTimerState: (isActive: boolean) => void,
  ) {
    this.notifyChangeRemote = notifyChange;
    this.notifyTimerStateRemote = notifyTimerState;

    // Deliver any change notifications that were received prior to setCallbacks.
    // (There shouldn't be early timer state changes.)
    for (const message of this.earlyChangeNotifications) {
      this.notifyChangeRemote(message);
    }
    this.earlyChangeNotifications = [];
  }

  //
  // Frontend methods (available via Comlink proxy in main thead)
  //

  getStaticProperties(): PuzzleStaticAttributes {
    return {
      displayName: this.frontend.name,
      canConfigure: this.frontend.canConfigure,
      canSolve: this.frontend.canSolve,
      needsRightButton: this.frontend.needsRightButton,
      wantsStatusbar: this.frontend.wantsStatusbar,
    };
  }

  newGame(): void {
    this.frontend.newGame();
  }

  restartGame(): void {
    this.frontend.restartGame();
  }

  undo(): void {
    this.frontend.undo();
  }

  redo(): void {
    this.frontend.redo();
  }

  solve(): string | undefined {
    return this.frontend.solve();
  }

  setPreset(id: number): void {
    this.frontend.setPreset(id);
  }

  processKey(key: number): boolean {
    return this.frontend.processKey(0, 0, key);
  }

  processMouse({ x, y }: Point, button: number): boolean {
    return this.frontend.processKey(x, y, button);
  }

  requestKeys(): KeyLabel[] {
    return this.frontend.requestKeys();
  }

  getPresets(): PresetMenuEntry[] {
    return this.frontend.getPresets();
  }

  getConfigItems(which: number): ConfigItems {
    return this.frontend.getConfigItems(which);
  }

  setConfigItems(which: number, items: ConfigItems): string | undefined {
    return this.frontend.setConfigItems(which, items);
  }

  redraw(): void {
    this.frontend.redraw();
  }

  getColourPalette(defaultBackground: Colour): Colour[] {
    return this.frontend.getColourPalette(defaultBackground);
  }

  size(maxSize: Size, isUserSize: boolean, devicePixelRatio: number): Size {
    return this.frontend.size(maxSize, isUserSize, devicePixelRatio);
  }

  formatAsText(): string | undefined {
    return this.frontend.formatAsText();
  }

  setGameId(id: string): string | undefined {
    return this.frontend.setGameId(id);
  }

  //
  // Drawing
  //

  private drawing?: Drawing;
  private drawingHandle?: DrawingHandle;

  attachCanvas(canvas: OffscreenCanvas, fontInfo: FontInfo): void {
    if (this.drawing) {
      throw new Error("attachCanvas called with another canvas already attached");
    }
    this.drawing = new Drawing(canvas, fontInfo);
    this.drawingHandle = this.drawing.bind(this.module);
    this.frontend.setDrawing(this.drawingHandle);
  }

  detachCanvas(): void {
    if (this.drawing) {
      this.frontend.setDrawing(null);
      this.drawingHandle?.delete();
      this.drawingHandle = undefined;
      this.drawing = undefined;
    }
  }

  resizeDrawing({ w, h }: Size, dpr: number): void {
    if (!this.drawing) {
      throw new Error("resizeDrawing called with no canvas attached");
    }
    this.drawing.resize(w, h, dpr);
  }

  setDrawingPalette(colors: string[]): void {
    if (!this.drawing) {
      throw new Error("setDrawingPalette called with no canvas attached");
    }
    this.drawing.setPalette(colors);
  }

  setDrawingFontInfo(fontInfo: FontInfo): void {
    if (!this.drawing) {
      throw new Error("setDrawingFontInfo called with no canvas attached");
    }
    this.drawing.setFontInfo(fontInfo);
  }

  //
  // Timer
  //

  private timerId?: number;
  private lastTimeMs = 0;

  private onAnimationFrame = async (timestampMs: number) => {
    if (this.timerId !== undefined) {
      // puzzle timer requires secs, not msec
      this.frontend.timer((timestampMs - this.lastTimeMs) / 1000);
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
      this.notifyTimerStateRemote?.(true);
    }
  };

  deactivateTimer = (): void => {
    if (this.timerId !== undefined) {
      self.cancelAnimationFrame(this.timerId);
      this.timerId = undefined;
      this.notifyTimerStateRemote?.(false);
    }
  };

  textFallback = (strings: string[]): string => {
    // Probably any Unicode string can be rendered, so use the preferred one.
    return strings[0];
  };

  notifyChange = (message: ChangeNotification): void => {
    if (this.notifyChangeRemote) {
      this.notifyChangeRemote(message);
    } else {
      // Early notification before main thread has installed callbacks
      // (e.g., initial state in Frontend constructor). Queue for delivery
      // when callbacks installed.
      this.earlyChangeNotifications.push(message);
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
