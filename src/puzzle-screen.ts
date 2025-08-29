import { SignalWatcher } from "@lit-labs/signals";
import { css, html, LitElement } from "lit";
import { query } from "lit/decorators/query.js";
import { customElement, property, state } from "lit/decorators.js";
import type { AppRouter } from "./app-router.ts";
import { type PuzzleData, puzzleDataMap, version } from "./catalog.ts";
import type { HelpViewer } from "./help-viewer.ts";
import type { PuzzleEvent } from "./puzzle/puzzle-context.ts";
import type { SettingsDialog } from "./settings-dialog.ts";
import { savedGames } from "./store/saved-games.ts";
import { settings } from "./store/settings.ts";
import { notifyError } from "./utils/errors.ts";
import { debounced, sleep } from "./utils/timing.ts";

// Register components
import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/divider/divider.js";
import "@awesome.me/webawesome/dist/components/dropdown-item/dropdown-item.js";
import "@awesome.me/webawesome/dist/components/skeleton/skeleton.js";
import "./enter-gameid-dialog.ts";
import "./head-matter.ts";
import "./help-viewer.ts";
import "./puzzle/puzzle-checkpoints.ts";
import "./puzzle/puzzle-context.ts";
import "./puzzle/puzzle-game-menu.ts";
import "./puzzle/puzzle-keys.ts";
import "./puzzle/puzzle-preset-menu.ts";
import "./puzzle/puzzle-view-interactive.ts";
import "./puzzle/puzzle-end-notification.ts";
import "./saved-game-dialogs.ts";
import "./settings-dialog.ts";
import "./share-dialog.ts";

@customElement("puzzle-screen")
export class PuzzleScreen extends SignalWatcher(LitElement) {
  @property({ type: Object })
  router?: AppRouter;

  /** The puzzle type, e.g. "blackbox" */
  @property({ type: String, attribute: "puzzle-type" })
  puzzleType = "";

  /** A game ID or random seed, including encoded params */
  @property({ type: String, attribute: "puzzle-gameid" })
  puzzleGameId?: string;

  /** Encoded params (ignored when puzzle-gameid provided) */
  @property({ type: String, attribute: "puzzle-params" })
  puzzleParams?: string;

  @state()
  private puzzleData?: PuzzleData;

  @state()
  private puzzleLoaded = false;

  @query("help-viewer", true)
  private helpPanel?: HelpViewer;

  @query("settings-dialog", true)
  private preferencesDialog?: SettingsDialog;

  /** If the current game has been saved or loaded, its filename. */
  savedFilename?: string;
  savedGameId?: string;

  private _autoSaveId?: string;
  private get autoSaveId(): string | undefined {
    return this._autoSaveId;
  }
  private set autoSaveId(value: string | undefined) {
    // Persist autoSaveId in history state; restored in connectedCallback
    this._autoSaveId = value;
    const newState = {
      ...window.history.state,
      puzzleAutoSaveType: this.puzzleType,
      puzzleAutoSaveId: value,
    };
    window.history.replaceState(newState, "");
  }

  override connectedCallback() {
    super.connectedCallback();
    const { puzzleAutoSaveId, puzzleAutoSaveType } = window.history.state ?? {};
    if (
      typeof puzzleAutoSaveId === "string" &&
      puzzleAutoSaveType === this.puzzleType
    ) {
      this._autoSaveId = puzzleAutoSaveId;
    }
  }

  protected override async willUpdate(changedProperties: Map<string, unknown>) {
    if (changedProperties.has("puzzleType") && this.puzzleType) {
      const data = puzzleDataMap[this.puzzleType];
      if (!data) {
        throw new Error(`Unknown puzzle type ${this.puzzleType}`);
      }
      this.puzzleData = data;
      this.autoSaveId = undefined;
      this.puzzleLoaded = false;
    }
  }

  override render() {
    if (!this.puzzleData) {
      throw new Error("PuzzleScreen.render without puzzleData");
    }

    const iconUrl = new URL(
      `./assets/icons/${this.puzzleType}-64d8.png`,
      import.meta.url,
    ).href;
    const helpUrl = new URL(
      `help/${this.puzzleType}-overview.html`,
      this.router?.baseUrl,
    ).href;
    const otherPuzzlesUrl = this.router?.reverse(this.router.defaultRoute)?.href;

    return html`
      <puzzle-context 
          type=${this.puzzleType} 
          @puzzle-loaded=${this.handlePuzzleLoaded}
          @puzzle-params-change=${this.handlePuzzleParamsChange}
          @puzzle-game-state-change=${this.handlePuzzleGameStateChange}
      >
        <head-matter>
          <title>
            ${this.puzzleData.name}&thinsp;&ndash;&thinsp;${this.puzzleData.description}&thinsp;&ndash;&thinsp;from 
            Simon Tatham’s portable puzzle collection
          </title>
          <meta name="application-name" content="${this.puzzleData.name}">
          <meta name="application-title" content="${this.puzzleData.name}">
          <meta name="description" content="${this.puzzleData.description}">
          <link rel="icon" href=${iconUrl}>
        </head-matter>
        
        <div class="app">
          <header>
            <h1>${this.puzzleData.name}</h1>
            <div class="subtitle">from Simon Tatham’s portable puzzle collection</div>
          </header>

          <div class="toolbar">
            <puzzle-game-menu @wa-select=${this.handleGameMenuCommand}>
              <wa-divider></wa-divider>
              <wa-dropdown-item value="share">
                <wa-icon slot="icon" name="share"></wa-icon>
                Share…
              </wa-dropdown-item>
              <wa-dropdown-item value="load">
                <wa-icon slot="icon" name="load-game"></wa-icon>
                Load…
              </wa-dropdown-item>
              <wa-dropdown-item value="save">
                <wa-icon slot="icon" name="save-game"></wa-icon>
                Save…
              </wa-dropdown-item>
              <wa-dropdown-item value="gameid">
                <wa-icon slot="icon" name="gameid"></wa-icon>
                Enter ID&hairsp;/&hairsp;seed…
              </wa-dropdown-item>
              <wa-divider></wa-divider>
              <wa-dropdown-item value="preferences">
                <wa-icon slot="icon" name="settings"></wa-icon>
                Preferences…
              </wa-dropdown-item>
              <wa-divider></wa-divider>
              <wa-dropdown-item value="catalog">
                <wa-icon slot="icon" name="back-to-catalog"></wa-icon>
                Other puzzles
              </wa-dropdown-item>
              <wa-divider></wa-divider>
              <wa-dropdown-item value="redraw">Redraw puzzle</wa-dropdown-item>
              <h3 class="version">v${version}</h3>
            </puzzle-game-menu>
            <puzzle-preset-menu></puzzle-preset-menu>
            <wa-button appearance="filled outlined" href=${helpUrl} @click=${this.showHelp}>
              <wa-icon slot="start" name="help"></wa-icon>
              Help
            </wa-button>
          </div>

          <puzzle-view-interactive 
              tabIndex="0"
              role="figure"
              aria-label="interactive puzzle displayed as an image"
              ?hide-statusbar=${!settings.showStatusbar}
              ?longPress=${settings.rightButtonLongPress}
              ?twoFingerTap=${settings.rightButtonTwoFingerTap}
              secondaryButtonAudioVolume=${settings.rightButtonAudioVolume}
              secondaryButtonHoldTime=${settings.rightButtonHoldTime}
              secondaryButtonDragThreshold=${settings.rightButtonDragThreshold}
              ?maximize=${settings.maximizePuzzleSize !== 0}
              .resizeElement=${
                // puzzle-view observes its own size, but we also want it to grow
                // when we're getting larger (without enabling flex-grow).
                this
              }
          >
            <wa-skeleton slot="loading" effect="sheen"></wa-skeleton>
          </puzzle-view-interactive>

          <puzzle-keys>
            <puzzle-checkpoints slot="after"></puzzle-checkpoints>
          </puzzle-keys>
        </div>

        <puzzle-end-notification>
          <wa-button
              slot="extra-actions-solved"
              appearance="filled outlined"
              @click=${this.handleChangeType}
          >
            <wa-icon slot="start" name="puzzle-type"></wa-icon>
            Change type
          </wa-button>
          <wa-button
              slot="extra-actions-solved"
              appearance="filled outlined"
              href=${otherPuzzlesUrl}
          >
            <wa-icon slot="start" name="back-to-catalog"></wa-icon>
            Other puzzles
          </wa-button>
        </puzzle-end-notification>

        <settings-dialog puzzle-name=${this.puzzleData.name}></settings-dialog>
        <share-dialog puzzle-name=${this.puzzleData.name} .router=${this.router}></share-dialog>
        <load-game-dialog 
            puzzleId=${this.puzzleType}
            @load-game-import=${this.handleImportGame}
            @load-game-load=${this.handleLoadGame}
        ></load-game-dialog>
        <save-game-dialog
            puzzleId=${this.puzzleType}
            @save-game-export=${this.handleExportGame}
            @save-game-save=${this.handleSaveGame}
        ></save-game-dialog>
        <enter-gameid-dialog puzzle-name=${this.puzzleData.name}></enter-gameid-dialog>
      </puzzle-context>

      <help-viewer src=${helpUrl} label=${`${this.puzzleData.name} Help`}></help-viewer>
    `;
  }

  private async handleGameMenuCommand(event: CustomEvent<{ item: { value: string } }>) {
    const value = event.detail.item.value;
    switch (value) {
      case "share":
        await this.showShareDialog();
        break;
      case "load":
        this.showLoadGameDialog();
        break;
      case "save":
        await this.showSaveGameDialog();
        break;
      case "gameid":
        this.showEnterGameIDDialog();
        break;
      case "catalog":
        this.router?.navigate(this.router.defaultRoute);
        break;
      case "preferences":
        if (this.preferencesDialog) {
          await this.preferencesDialog.show();
        }
        break;
      case "redraw":
        // TODO: Remove the "redraw" command (added for debugging Safari)
        this.shadowRoot?.querySelector("puzzle-view-interactive")?.redraw();
        break;
      default:
        // Other commands are handled by puzzle-game-menu
        break;
    }
  }

  private async showShareDialog() {
    const dialog = this.shadowRoot?.querySelector("share-dialog");
    if (dialog && !dialog.open) {
      await dialog.reset();
      dialog.open = true;
    }
  }

  private showLoadGameDialog() {
    const dialog = this.shadowRoot?.querySelector("load-game-dialog");
    if (dialog && !dialog.open) {
      dialog.open = true;
    }
  }

  private async showSaveGameDialog() {
    const dialog = this.shadowRoot?.querySelector("save-game-dialog");
    if (dialog && !dialog.open) {
      dialog.filename =
        this.savedFilename ?? (await savedGames.makeUntitledFilename(this.puzzleType));
      dialog.open = true;
    }
  }

  private showEnterGameIDDialog() {
    const dialog = this.shadowRoot?.querySelector("enter-gameid-dialog");
    if (dialog && !dialog.open) {
      dialog.reset();
      dialog.open = true;
    }
  }

  private async handleLoadGame(event: HTMLElementEventMap["load-game-load"]) {
    const dialog = event.target as HTMLElementTagNameMap["load-game-dialog"];
    const { filename } = event.detail;
    const puzzle = this.shadowRoot?.querySelector("puzzle-context")?.puzzle;
    if (puzzle && filename) {
      event.preventDefault(); // we'll close the dialog if successful
      const { error, gameId } = await savedGames.loadGame(puzzle, filename);
      if (error !== undefined) {
        // TODO: display error in dialog somehow?
        await notifyError(error);
      } else if (gameId) {
        this.savedGameId = gameId;
        this.savedFilename = filename;
        dialog.open = false;
      }
    }
  }

  private async handleSaveGame(event: HTMLElementEventMap["save-game-save"]) {
    const dialog = event.target as HTMLElementTagNameMap["save-game-dialog"];
    const { filename } = event.detail;
    const puzzle = this.shadowRoot?.querySelector("puzzle-context")?.puzzle;
    if (puzzle && filename) {
      event.preventDefault(); // we'll close the dialog if successful
      await savedGames.saveGame(puzzle, filename);
      this.savedGameId = puzzle.currentGameId;
      this.savedFilename = filename;
      dialog.open = false;
    }
  }

  private async handleImportGame(_event: HTMLElementEventMap["load-game-import"]) {
    const puzzle = this.shadowRoot?.querySelector("puzzle-context")?.puzzle;
    if (puzzle) {
      const input = Object.assign(document.createElement("input"), {
        type: "file",
        multiple: false,
        accept: ".sav,.sgt,.sgtpuzzle,.txt",
        onchange: async () => {
          const file = input.files?.[0];
          if (file) {
            const data = new Uint8Array(await file.arrayBuffer());
            const errorMessage = await puzzle.loadGame(data);
            if (errorMessage) {
              await notifyError(errorMessage);
            }
          }
        },
        onerror: async (error: unknown) => {
          await notifyError(String(error));
        },
      });
      input.click();
    }
  }

  private async handleExportGame(event: HTMLElementEventMap["save-game-export"]) {
    const puzzle = this.shadowRoot?.querySelector("puzzle-context")?.puzzle;
    if (puzzle) {
      const type = "application/octet-stream"; // or text/plain, or a type registered to us (upstream uses octet-stream)
      const data = await puzzle.saveGame();
      const blob = new Blob([data], { type });
      const url = URL.createObjectURL(blob);
      const dateStr = new Date().toLocaleString();
      const filename = event.detail.filename || `${puzzle.displayName} ${dateStr}`;
      const anchor = Object.assign(document.createElement("a"), {
        href: url,
        download: `${filename}.sav`,
        type,
      });
      anchor.click();
      await sleep(10);
      URL.revokeObjectURL(url);
    }
  }

  private showHelp(event: MouseEvent) {
    event.preventDefault();
    this.helpPanel?.show();
  }

  private async handleChangeType() {
    // Show the Type menu, from the button in the puzzle-end-notification
    await this.shadowRoot?.querySelector("puzzle-end-notification")?.hide();
    this.shadowRoot?.querySelector("puzzle-preset-menu")?.show();
  }

  private async handlePuzzleLoaded(event: PuzzleEvent) {
    const { puzzle } = event.detail;
    event.preventDefault(); // We'll set up our own new game (or restore one from autoSave)

    const prefs = await settings.getPuzzlePreferences(puzzle.puzzleId);
    await puzzle.setPreferences(prefs);

    // Set up the default params for all new games in this session.
    // Prefer the url's ?type=<params> if provided from the router and valid.
    // Otherwise, try the last used params stored in our settings.
    // (If nothing works, every puzzle has its own defaults.)
    // This applies even when puzzleGameId is provided, to set the default
    // params for subsequent new games.
    const settingsParams = await settings.getParams(puzzle.puzzleId);
    for (const params of [this.puzzleParams, settingsParams]) {
      if (params) {
        const error = await puzzle.setParams(params);
        if (!error) {
          break; // successfully set default params
        }
        console.warn(
          `Error setting puzzle ${puzzle.puzzleId} params to "${params}": ` +
            `${error}. Ignoring.`,
        );
        if (params === settingsParams) {
          // Don't try those again
          await settings.setParams(puzzle.puzzleId, undefined);
        } else {
          notifyError(`Ignoring invalid type= in URL (${error})`).then();
        }
      }
    }

    // TODO: restore custom presets from settings

    // Ensure there's a game, from (in order of preference)
    // - puzzleGameId (URL hash from router)
    // - the most recent autoSave
    // - a new game
    let hasGame = false;

    if (this.puzzleGameId) {
      const error = await puzzle.newGameFromId(this.puzzleGameId);
      if (!error) {
        hasGame = true;
        this.autoSaveId = savedGames.makeAutoSaveId();
      } else {
        notifyError(`Ignoring invalid id= in URL (${error})`).then();
      }
    }

    if (!this.autoSaveId) {
      this.autoSaveId = await savedGames.findMostRecentAutoSave(puzzle.puzzleId);
    }
    if (!hasGame && !this.puzzleParams && this.autoSaveId) {
      // Restore a recent autosave, unless params in url (which might not match)
      hasGame = await savedGames.restoreAutoSavedGame(puzzle, this.autoSaveId);
    }

    if (!hasGame) {
      await puzzle.newGame();
    }

    this.puzzleLoaded = true;
    await this.shadowRoot?.querySelector("puzzle-context")?.updateComplete;

    // Clear any specific type or game id params from the URL
    if (this.router && (this.puzzleParams || this.puzzleGameId)) {
      const cleanUrl = this.router.reverse({
        name: "puzzle",
        params: { puzzleType: this.puzzleType },
      });
      this.router.navigate(cleanUrl, true);
    }
  }

  private async handlePuzzleParamsChange(event: PuzzleEvent) {
    // (Ignore params change as puzzle is loading -- that's its default value.)
    const { puzzle } = event.detail;
    if (
      this.puzzleLoaded &&
      puzzle.params &&
      puzzle.params !== (await settings.getParams(puzzle.puzzleId))
    ) {
      await settings.setParams(puzzle.puzzleId, puzzle.params);
    }
  }

  @debounced(250)
  private async handlePuzzleGameStateChange(event: PuzzleEvent) {
    const { puzzle } = event.detail;
    if (puzzle.currentGameId) {
      if (puzzle.currentGameId !== this.savedGameId) {
        this.savedFilename = undefined;
        this.savedGameId = puzzle.currentGameId;
      }
      if (puzzle.totalMoves > 0 && !puzzle.isSolved) {
        // Wait to autosave until the user has made at least one actual move,
        // to avoid autosaving from just browsing through puzzles.
        this.autoSaveId ??= savedGames.makeAutoSaveId();
        await savedGames.autoSaveGame(puzzle, this.autoSaveId);
      } else if (this.autoSaveId) {
        // Don't retain autosave for solved or unstarted puzzle.
        const autoSaveId = this.autoSaveId;
        this.autoSaveId = undefined;
        await savedGames.removeAutoSavedGame(puzzle, autoSaveId);
      }
    }
  }

  //
  // Styles
  //

  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      container-type: size;
    }
    
    .app {
      --app-padding: var(--wa-space-xl);
      --app-spacing: var(--wa-space-l);

      @container (max-width: 40rem) {
        --app-padding: var(--wa-space-l);
        --app-spacing: var(--wa-space-m);
      }

      height: 100%;
      box-sizing: border-box;
      position: relative;

      display: flex;
      flex-direction: column;
      align-items: flex-start;

      /* The padding is split between vertical padding and horizontal margin
       * on children to allow the puzzle-view (alone) to extend into the 
       * horizontal "padding" on narrow screens. (Negative margin doesn't
       * work with puzzle-view's automatic size calculations.) */
      gap: var(--app-spacing);
      padding: var(--app-padding) 0;
      & > * {
        margin: 0 var(--app-padding);
        max-width: calc(100% - 2 * var(--app-padding));
      }
      
      @media (prefers-reduced-motion: no-preference) {
        transition:
          gap var(--wa-transition-fast)  var(--wa-transition-easing),
          padding var(--wa-transition-fast)  var(--wa-transition-easing);
        & > * {
          transition: margin var(--wa-transition-fast) var(--wa-transition-easing);
        }
      }

      background-color: var(--wa-color-surface-lowered);
      color: var(--wa-color-text-normal);
    }

    h1 {
      margin: 0;
      color: var(--wa-color-neutral-20);
      font-weight: var(--wa-font-weight-bold);
      font-size: var(--wa-font-size-xl);
      line-height: var(--wa-line-height-condensed);
    }
    .subtitle {
      font-size: var(--wa-font-size-m);
      font-weight: var(--wa-font-weight-normal);
      color: var(--wa-color-text-quiet);
    }
    @container (max-width: 36rem) {
      /* This sizing is just kind of eyeballed with "Same Game",
       * which seems to have the longest name. */
      /* TODO: should really combine the header and top toolbar on small screens */
      .subtitle {
        display: none;
      }
    }

    header {
      display: flex;
      align-items: baseline;
      text-wrap: nowrap;
      h1 {
        margin-inline-end: 0.5em;
      }
    }

    .toolbar {
      display: flex;
      justify-content: flex-start;
      align-items: baseline;
      gap: var(--wa-space-s);
    }

    puzzle-preset-menu {
      flex: 0 1 auto;
      min-width: 5rem;
    }

    puzzle-view-interactive {
      /* Shrink to fit, but don't grow beyond natural height to keep
       * bottom toolbar snug against puzzle. (Our ResizeController lets
       * the puzzle grow when we have more space available.) */
      flex: 0 1 auto;
      min-height: 5rem; /* allows flexing */
      overflow: auto; /* scrollbars if it still can't fit */
      background-color: var(--wa-color-surface-default);
      border-radius: var(--wa-form-control-border-radius);
      /*border: 1px solid var(--wa-form-control-border-color);*/
      /*border: 1px solid var(--wa-color-surface-border);*/
      --spacing: var(--wa-space-m);
    }
    
    @container (max-width: 25rem) {
      .app puzzle-view-interactive {
        margin: 0;
        border-radius: 0;
        min-width: 100%;
        --spacing: var(--wa-space-l); /* --app-padding */
      }
    }

    wa-skeleton {
      --color: var(--wa-color-neutral-95);
      --sheen-color: var(--wa-color-brand-95);
      &::part(indicator) {
        border-radius: 0;
      }
    }

    .version {
      /* Allow selecting the version info */
      -moz-user-select: all;
      -webkit-user-select: all;
      user-select: all;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "puzzle-screen": PuzzleScreen;
  }
}
