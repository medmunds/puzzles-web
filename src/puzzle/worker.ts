import * as Comlink from "comlink";
import { transfer } from "comlink";
import createModule from "../assets/puzzles/emcc-runtime";
import { installErrorHandlersInWorker } from "../utils/errors.ts";
import { Drawing } from "./drawing.ts";
import type {
  ChangeNotification,
  Colour,
  ConfigDescription,
  ConfigValues,
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

installErrorHandlersInWorker();

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
    this.frontend.delete();
    this.deleteDrawing();
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

  processKey(key: number): boolean {
    return this.frontend.processKey(0, 0, key);
  }

  processMouse({ x, y }: Point, button: number): boolean {
    return this.frontend.processKey(x, y, button);
  }

  requestKeys(): KeyLabel[] {
    return this.frontend.requestKeys();
  }

  getParams(): string {
    return this.frontend.getParams();
  }

  setParams(params: string): string | undefined {
    return this.frontend.setParams(params);
  }

  getPresets(): PresetMenuEntry[] {
    return this.frontend.getPresets();
  }

  getCustomParamsConfig(): ConfigDescription {
    return this.frontend.getCustomParamsConfig();
  }

  getCustomParams(): ConfigValues {
    return this.frontend.getCustomParams();
  }

  setCustomParams(values: ConfigValues): string | undefined {
    return this.frontend.setCustomParams(values);
  }

  encodeCustomParams(values: ConfigValues): string {
    return this.frontend.encodeCustomParams(values);
  }

  getPreferencesConfig(): ConfigDescription {
    return this.frontend.getPreferencesConfig();
  }

  getPreferences(): ConfigValues {
    return this.frontend.getPreferences();
  }

  setPreferences(values: ConfigValues): string | undefined {
    return this.frontend.setPreferences(values);
  }

  savePreferences(): Uint8Array {
    const data = this.frontend.savePreferences();
    return transfer(data, [data.buffer]);
  }

  loadPreferences(data: Uint8Array): string | undefined {
    return this.frontend.loadPreferences(data);
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

  loadGame(data: Uint8Array<ArrayBuffer>): string | undefined {
    return this.frontend.loadGame(data);
  }

  saveGame(): Uint8Array<ArrayBuffer> {
    const data = this.frontend.saveGame() as Uint8Array<ArrayBuffer>;
    return transfer(data, [data.buffer]);
  }

  //
  // Drawing
  //

  private drawing?: Drawing;
  private drawingHandle?: DrawingHandle;

  attachCanvas(canvas: OffscreenCanvas, fontInfo: FontInfo): void {
    if (this.drawing) {
      this.deleteDrawing();
    }
    this.drawing = new Drawing(canvas, fontInfo);
    this.drawingHandle = this.drawing.bind(this.module);
    this.frontend.setDrawing(this.drawingHandle);
  }

  deleteDrawing(): void {
    if (this.drawing) {
      // Frontend may already be deleted, so don't do:
      //   this.frontend.setDrawing(null);
      this.drawingHandle?.delete();
      this.drawingHandle = undefined;
      this.drawing = undefined;
    }
  }

  detachCanvas(): void {
    // Do nothing. Leave the existing Drawing in place, because the Frontend
    // might call into it during Frontend.delete(). (E.g., midend_free
    // will call blitter_free in puzzles like Galaxies and Signpost.)
    // The resources are released either when some other canvas is ready
    // to be attached or in WorkerPuzzle.delete() after Frontend.delete().
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

  private timerActive = false;
  private lastTimeMs = 0;

  private onAnimationFrame = async (timestampMs: number) => {
    if (this.timerActive) {
      // puzzle timer requires secs, not msec
      const tplus = (timestampMs - this.lastTimeMs) / 1000;
      this.lastTimeMs = timestampMs;
      this.frontend.timer(tplus);
      self.requestAnimationFrame(this.onAnimationFrame);
    }
  };

  //
  // Frontend callbacks
  //

  activateTimer = (): void => {
    if (!this.timerActive) {
      this.timerActive = true;
      this.lastTimeMs = self.performance.now();
      this.notifyTimerStateRemote?.(true);
      self.requestAnimationFrame(this.onAnimationFrame);
    }
  };

  deactivateTimer = (): void => {
    if (this.timerActive) {
      this.timerActive = false;
      // (No need to cancelAnimationFrame--we'll get one more and ignore it.)
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
