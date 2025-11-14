import { SignalWatcher } from "@lit-labs/signals";
import { css, html, nothing, type TemplateResult } from "lit";
import { query } from "lit/decorators/query.js";
import { customElement, property, state } from "lit/decorators.js";
import { type PuzzleData, puzzleDataMap } from "./puzzle/catalog.ts";
import type { Puzzle } from "./puzzle/puzzle.ts";
import type { PuzzleEvent } from "./puzzle/puzzle-context.ts";
import { canonicalPuzzlePageUrl, helpUrl, homePageUrl } from "./routing.ts";
import { Screen } from "./screen.ts";
import { savedGames } from "./store/saved-games.ts";
import { settings } from "./store/settings.ts";
import { cssWATweaks } from "./utils/css.ts";
import { notifyError } from "./utils/errors.ts";
import { hasCtrlKey, preventDoubleTapZoomOnButtons } from "./utils/events.ts";
import { debounced, sleep } from "./utils/timing.ts";

// Register components
import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/divider/divider.js";
import "@awesome.me/webawesome/dist/components/dropdown/dropdown.js";
import "@awesome.me/webawesome/dist/components/dropdown-item/dropdown-item.js";
import "@awesome.me/webawesome/dist/components/icon/icon.js";
import "@awesome.me/webawesome/dist/components/skeleton/skeleton.js";
import "./dynamic-content.ts";
import "./head-matter.ts";
import "./puzzle/puzzle-context.ts";
import "./puzzle/puzzle-history.ts";
import "./puzzle/puzzle-keys.ts";
import "./puzzle/puzzle-preset-menu.ts";
import "./puzzle/puzzle-view-interactive.ts";
import "./puzzle/puzzle-end-notification.ts";

@customElement("puzzle-screen")
export class PuzzleScreen extends SignalWatcher(Screen) {
  /** The puzzle type, e.g. "blackbox" */
  @property({ type: String, attribute: "puzzleid" })
  puzzleId = "";

  /** A game ID or random seed, including encoded params */
  @property({ type: String, attribute: "gameid" })
  gameId?: string;

  /** Encoded params (ignored when puzzle-gameid provided) */
  @property({ type: String, attribute: "params" })
  params?: string;

  @state()
  private puzzleData?: PuzzleData;

  @state()
  private puzzleLoaded = false;

  @query("puzzle-context")
  private puzzleContext?: HTMLElementTagNameMap["puzzle-context"];

  get puzzle(): Puzzle | undefined {
    return this.puzzleContext?.puzzle;
  }

  /** If the current game has been saved or loaded, its filename. */
  savedFilename?: string;
  savedGameId?: string;

  private _autoSaveFilename?: string;
  private get autoSaveFilename(): string | undefined {
    return this._autoSaveFilename;
  }
  private set autoSaveFilename(value: string | undefined) {
    // Persist autoSaveFilename in history state; restored in connectedCallback
    this._autoSaveFilename = value;
    const newState = {
      ...window.history.state,
      puzzleAutoSavePuzzleId: this.puzzleId,
      puzzleAutoSaveFilename: value,
    };
    window.history.replaceState(newState, "");
  }

  override connectedCallback() {
    super.connectedCallback();
    document.addEventListener("click", preventDoubleTapZoomOnButtons);
    window.addEventListener("keydown", this.handleBubbledKeyDown);
    const { puzzleAutoSaveFilename, puzzleAutoSavePuzzleId } =
      window.history.state ?? {};
    if (
      typeof puzzleAutoSaveFilename === "string" &&
      puzzleAutoSavePuzzleId === this.puzzleId
    ) {
      this._autoSaveFilename = puzzleAutoSaveFilename;
    }
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener("click", preventDoubleTapZoomOnButtons);
    window.removeEventListener("keydown", this.handleBubbledKeyDown);
  }

  protected override async willUpdate(changedProperties: Map<string, unknown>) {
    if (changedProperties.has("puzzleId") && this.puzzleId) {
      const data = puzzleDataMap[this.puzzleId];
      if (!data) {
        throw new Error(`Unknown puzzleId ${this.puzzleId}`);
      }
      this.puzzleData = data;
      this.autoSaveFilename = undefined;
      this.puzzleLoaded = false;
      this.defaultHelpLabel = `${this.puzzleData.name} Help`;
    }
  }

  override render() {
    if (!this.puzzleData) {
      throw new Error("PuzzleScreen.render without puzzleData");
    }

    const canonicalUrl = canonicalPuzzlePageUrl(this.puzzleId);
    const iconUrl = new URL(`./assets/icons/${this.puzzleId}-64d8.png`, import.meta.url)
      .href;

    return html`
      <puzzle-context 
          puzzleid=${this.puzzleId}
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
          ${this.themeColor ? html`<meta name="theme-color" content=${this.themeColor}>` : nothing}
          ${canonicalUrl ? html`<link rel="canonical" href="${canonicalUrl}">` : nothing}
          <link rel="icon" href=${iconUrl}>
        </head-matter>
        
        <main>
          <header>
            ${this.renderGameMenu()}
            <puzzle-preset-menu 
                appearance="plain" 
                variant="brand"
                placement=${this.orientation === "vertical" ? "bottom" : "right"}
                ?without-icon=${this.size === "small" && this.orientation === "vertical"}
                ?without-label=${this.orientation === "horizontal"}
            ></puzzle-preset-menu>
            <wa-button
                appearance="plain" variant="brand"
                href=${helpUrl(this.puzzleId).href} 
            >${
              this.compactButtons
                ? html`<wa-icon name="help" label="Help"></wa-icon>`
                : html`
                  <wa-icon name="help" slot="start"></wa-icon>
                  Help
                `
            }</wa-button>
          </header>

          <puzzle-view-interactive 
              role="figure"
              aria-label="interactive puzzle displayed as an image"
              statusbar-placement=${settings.statusbarPlacement}
              ?longPress=${settings.rightButtonLongPress}
              ?twoFingerTap=${settings.rightButtonTwoFingerTap}
              secondaryButtonAudioVolume=${settings.rightButtonAudioVolume}
              secondaryButtonHoldTime=${settings.rightButtonHoldTime}
              secondaryButtonDragThreshold=${settings.rightButtonDragThreshold}
              max-scale=${settings.maxScale}
          >
            <wa-skeleton slot="loading" effect="sheen"></wa-skeleton>
          </puzzle-view-interactive>

          <footer>
            ${
              settings.showPuzzleKeyboard
                ? html`<puzzle-keys tabindex="-1"></puzzle-keys>`
                : nothing
            }
            <puzzle-history></puzzle-history>
          </footer>
        </main>

        ${settings.showEndNotification ? this.renderEndNotification() : nothing}
        <dynamic-content></dynamic-content>
      </puzzle-context>
    `;
  }

  private renderEndNotification() {
    const otherPuzzlesUrl = homePageUrl().href;
    return html`
      <puzzle-end-notification>
        <wa-button
            slot="extra-actions-solved"
            data-command="share"
        >
          <wa-icon slot="start" name="share"></wa-icon>
          Share
        </wa-button>
        <wa-button
            slot="extra-actions-solved"
            data-command="change-type"
        >
          <wa-icon slot="start" name="puzzle-type"></wa-icon>
          Change type
        </wa-button>
        <wa-button
            slot="extra-actions-solved"
            href=${otherPuzzlesUrl}
        >
          <wa-icon slot="start" name="back-to-catalog"></wa-icon>
          Other puzzles
        </wa-button>
      </puzzle-end-notification>
    `;
  }

  private renderGameMenu(): TemplateResult {
    const iconName = this.puzzleData?.unfinished ? "unfinished" : "game";
    const label = this.puzzleData?.name ?? "Game";
    const enableDeveloperCommands = false;
    return html`
      <wa-dropdown
          placement=${this.orientation === "vertical" ? "bottom" : "right"}
      >
        <wa-button 
            slot="trigger" 
            class="game-menu-trigger" 
            appearance="plain" variant="brand"
            with-caret
        >${
          this.orientation === "horizontal"
            ? html`<wa-icon name=${iconName} label=${label}></wa-icon>`
            : this.size === "small"
              ? label
              : html`
                <wa-icon name=${iconName} slot="start"></wa-icon>
                ${label}
              `
        }</wa-button>
        <wa-dropdown-item data-command="new-game">
          <wa-icon slot="icon" name="new-game"></wa-icon>
          New game
        </wa-dropdown-item>
        <wa-dropdown-item data-command="restart-game">
          <wa-icon slot="icon" name="restart-game"></wa-icon>
          Restart game
        </wa-dropdown-item>
        ${
          this.puzzle?.canSolve
            ? html`
              <wa-dropdown-item data-command="solve" ?disabled=${this.puzzle?.status === "solved"}>
                <wa-icon slot="icon" name="show-solution"></wa-icon>
                Solve
              </wa-dropdown-item>
              `
            : nothing
        }
        <wa-dropdown-item data-command="share">
          <wa-icon slot="icon" name="share"></wa-icon>
          Share…
        </wa-dropdown-item>
        <wa-divider></wa-divider>
        <wa-dropdown-item data-command="load-game">
          <wa-icon slot="icon" name="load-game"></wa-icon>
          Load…
        </wa-dropdown-item>
        <wa-dropdown-item data-command="save-game">
          <wa-icon slot="icon" name="save-game"></wa-icon>
          Save…
        </wa-dropdown-item>
        <wa-dropdown-item data-command="enter-gameid">
          <wa-icon slot="icon" name="gameid"></wa-icon>
          Enter ID&hairsp;/&hairsp;seed…
        </wa-dropdown-item>
        <wa-divider></wa-divider>
        <wa-dropdown-item data-command="settings">
          <wa-icon slot="icon" name="settings"></wa-icon>
          Preferences…
        </wa-dropdown-item>
        <wa-dropdown-item data-command="about">
          <wa-icon slot="icon" name="info"></wa-icon>
          About
        </wa-dropdown-item>
        <wa-divider></wa-divider>
        <wa-dropdown-item data-command="home">
          <wa-icon slot="icon" name="back-to-catalog"></wa-icon>
          Other puzzles
        </wa-dropdown-item>
        ${
          enableDeveloperCommands
            ? html`
              <wa-divider></wa-divider>
              <wa-dropdown-item data-command="redraw">Redraw puzzle</wa-dropdown-item>
            `
            : nothing
        }
      </wa-dropdown>
    `;
  }

  //
  // Commands
  //

  protected override registerCommandHandlers() {
    super.registerCommandHandlers();
    Object.assign(this.commandMap, {
      "change-type": this.showTypeMenu,
      "enter-gameid": this.showEnterGameIDDialog,
      "load-game": this.showLoadGameDialog,
      "new-game": () => this.puzzle?.newGame(),
      redraw: () => this.shadowRoot?.querySelector("puzzle-view-interactive")?.redraw(),
      "restart-game": () => this.puzzle?.restartGame(),
      "save-game": this.showSaveGameDialog,
      share: this.showShareDialog,
      solve: () => this.puzzle?.solve(),
    });
  }

  private async showShareDialog(panel?: string) {
    await import("./share-dialog.ts");
    const dialog = await this.dynamicContent?.addItem({
      tagName: "share-dialog",
      render: () => html`<share-dialog></share-dialog>`,
    });
    if (dialog && !dialog.open) {
      await dialog.reset();
      dialog.open = true;
    }
    if (dialog && panel) {
      await dialog.updateComplete;
      await dialog.showPanel(panel);
    }
  }

  private async showLoadGameDialog() {
    await import("./saved-game-dialogs.ts");
    const dialog = await this.dynamicContent?.addItem({
      tagName: "load-game-dialog",
      render: () => html`
        <load-game-dialog
            puzzleid=${this.puzzleId}
            @load-game-import=${this.handleImportGame}
            @load-game-load=${this.handleLoadGame}
        ></load-game-dialog>
      `,
    });
    if (dialog && !dialog.open) {
      const puzzle = this.shadowRoot?.querySelector("puzzle-context")?.puzzle;
      dialog.gameInProgress = (puzzle?.totalMoves ?? 0) > 0;
      dialog.open = true;
    }
  }

  private async showSaveGameDialog() {
    await import("./saved-game-dialogs.ts");
    const dialog = await this.dynamicContent?.addItem({
      tagName: "save-game-dialog",
      render: () => html`
        <save-game-dialog
            puzzleid=${this.puzzleId}
            @save-game-export=${this.handleExportGame}
            @save-game-save=${this.handleSaveGame}
        ></save-game-dialog>
      `,
    });
    if (dialog && !dialog.open) {
      dialog.filename =
        this.savedFilename ?? (await savedGames.makeUntitledFilename(this.puzzleId));
      dialog.open = true;
    }
  }

  private async showEnterGameIDDialog() {
    await import("./enter-gameid-dialog.ts");
    const dialog = await this.dynamicContent?.addItem({
      tagName: "enter-gameid-dialog",
      render: () => html`<enter-gameid-dialog></enter-gameid-dialog>`,
    });
    if (dialog && !dialog.open) {
      dialog.reset();
      dialog.open = true;
    }
  }

  private handleLoadGame = async (event: HTMLElementEventMap["load-game-load"]) => {
    // (dynamic-content event listener: must be self-bound function)
    const dialog = event.target as HTMLElementTagNameMap["load-game-dialog"];
    const { filename } = event.detail;
    const puzzle = this.shadowRoot?.querySelector("puzzle-context")?.puzzle;
    if (puzzle && filename) {
      event.preventDefault(); // we'll close the dialog if successful
      const { error, gameId } = await savedGames.loadGame(puzzle, filename);
      if (error !== undefined) {
        // TODO: display error in dialog (like enter-gameid-dialog does)
        await notifyError(error);
      } else if (gameId) {
        this.savedGameId = gameId;
        this.savedFilename = filename;
        dialog.open = false;
      }
    }
  };

  private handleSaveGame = async (event: HTMLElementEventMap["save-game-save"]) => {
    // (dynamic-content event listener: must be self-bound function)
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
  };

  private handleImportGame = async (
    _event: HTMLElementEventMap["load-game-import"],
  ) => {
    // (dynamic-content event listener: must be self-bound function)
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
  };

  private handleExportGame = async (event: HTMLElementEventMap["save-game-export"]) => {
    // (dynamic-content event listener: must be self-bound function)
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
  };

  private async showTypeMenu() {
    // (from the button in the puzzle-end-notification)
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
    for (const params of [this.params, settingsParams]) {
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
          void notifyError(`Ignoring invalid type= in URL (${error})`);
        }
      }
    }

    // TODO: restore custom presets from settings

    // Ensure there's a game, from (in order of preference)
    // - puzzleGameId (URL hash from router)
    // - the most recent autoSave
    // - a new game
    let hasGame = false;

    if (this.gameId) {
      const error = await puzzle.newGameFromId(this.gameId);
      if (!error) {
        hasGame = true;
        this.autoSaveFilename = savedGames.makeAutoSaveFilename();
      } else {
        void notifyError(`Ignoring invalid id= in URL (${error})`).then();
      }
    }

    if (!this.autoSaveFilename) {
      this.autoSaveFilename = await savedGames.findMostRecentAutoSave(puzzle.puzzleId);
    }
    if (!hasGame && !this.params && this.autoSaveFilename) {
      // Restore a recent autosave, unless params in url (which might not match)
      hasGame = await savedGames.restoreAutoSavedGame(puzzle, this.autoSaveFilename);
    }

    if (!hasGame) {
      await puzzle.newGame();
    }

    this.puzzleLoaded = true;
    await this.shadowRoot?.querySelector("puzzle-context")?.updateComplete;
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
        this.autoSaveFilename ??= savedGames.makeAutoSaveFilename();
        await savedGames.autoSaveGame(puzzle, this.autoSaveFilename);
      } else if (this.autoSaveFilename) {
        // Don't retain autosave for solved or unstarted puzzle.
        const autoSaveFilename = this.autoSaveFilename;
        this.autoSaveFilename = undefined;
        await savedGames.removeAutoSavedGame(puzzle, autoSaveFilename);
      }
    }
  }

  private handleBubbledKeyDown = async (event: KeyboardEvent) => {
    // If a key event arrives at the document when nothing else is focused,
    // focus the puzzle and redirect the event to it.
    if (event.key === "Tab" || hasCtrlKey(event)) {
      // Don't redirect keyboard navigation
      // or (possible) browser command shortcut keys
      return;
    }
    const activeElement = document.activeElement;
    if (activeElement === document.body || activeElement === document.documentElement) {
      // Only redirect keys that are potentially handled by the puzzle.
      // (Don't focus the puzzle on Shift or Alt or NextTrack or FnLock.)
      const puzzleView = this.shadowRoot?.querySelector("puzzle-view-interactive");
      if (puzzleView?.eventKeyToPuzzleKey(event.key) !== undefined) {
        puzzleView.focus();
        await puzzleView.handleKeyEvent(event);
      }
    }
  };

  //
  // Styles
  //

  static styles = [
    cssWATweaks,
    css`
      :host {
        display: block;
        box-sizing: border-box;
        /* Dynamic viewport units Baseline 2023 */
        width: 100vw;
        height: 100vh;
        width: 100dvw;
        height: 100dvh;
      }
      
      main {
        height: 100%;
        box-sizing: border-box;
        position: relative;
  
        display: flex;
        flex-direction: column;
        align-items: stretch;
  
        background-color: var(--wa-color-brand-fill-quiet);
        color: var(--wa-color-text-normal);
      }
  
      header, footer {
        box-sizing: border-box;
        width: 100%;
  
        display: flex;
        justify-content: flex-start;
  
        > *:last-child {
          :host([orientation="vertical"]) & {
            margin-inline-start: auto;
          }
          :host([orientation="horizontal"]) & {
            margin-block-start: auto;
          }
        }
      }
  
      header {
        align-items: baseline;
        padding-block: var(--wa-space-xs);
        /* app-padding less button padding */
        padding-inline: calc(var(--app-padding) - min(var(--wa-form-control-padding-inline), var(--app-padding)));
        gap: 0; /* toolbar buttons all have lots of padding built in */
        background-color: var(--app-theme-color);

        .game-menu-trigger {
          /* Larger label and icon, but not larger overall base height */
          &::part(label), &::part(start) {
            font-size: var(--app-title-font-size);
          }
        }

        puzzle-preset-menu {
          flex: 0 1 auto;
          min-width: 1rem;
        }

        wa-button::part(base),
        puzzle-preset-menu::part(trigger-base) {
          color: var(--wa-color-text-normal);
        }
      }

      puzzle-view-interactive {
        flex: 1 1 auto;
        min-height: 5rem; /* allows flexing */
        min-width: 5rem;
        margin-block: var(--app-spacing);
        margin-inline: var(--app-padding);
  
        --spacing: var(--app-spacing);
        --background-color: var(--wa-color-surface-default);
        --border-radius: var(--wa-form-control-border-radius);
        
        /* In small layouts, fill the cross axis */
        :host([size="small"]) & {
          :host([orientation="vertical"]) & {
            margin-inline: 0;
            min-width: 100%;
          }
          :host([orientation="horizontal"]) & {
            margin-block: 0;
            min-height: 100%;
          }
        }
      }
      
      puzzle-end-notification {
        &::part(dialog) {
          /* Position at bottom, aligned with puzzle controls */
          margin-block-end: var(--app-padding);
        }
        
        :has(share-dialog[open]) & {
          /* Hide the end notification and its extra backdrop 
           * while share-dialog is open above it */
          --opacity: 0;
        }
        
        & wa-button::part(label) {
          /* Align icons at left of buttons, center labels */
          flex: 1 1 auto;
          text-align: center;
        }
      }
  
      footer {
        align-items: end;
        padding: var(--app-padding);
        gap: var(--app-spacing);
        
        :host([orientation="vertical"]) & {
          padding-block-start: 0;
        }
        :host([orientation="horizontal"]) & {
          padding-inline-start: 0;
        }

        :host([size="small"]) & {
          /* Stack the controls vertically on small screens */
          flex-direction: column;
        }
      }
        
      :host([orientation="horizontal"]) {
        main {
          flex-direction: row;
        }
        header, footer {
          flex-direction: column;
          align-items: end;
        }
        puzzle-keys::part(group) {
          flex-direction: column;
        }
        header, footer {
          max-width: fit-content;
        }
      }
  
      wa-skeleton {
        --color: var(--wa-color-brand-fill-quiet);
        --sheen-color: var(--wa-color-brand-fill-normal);
        &::part(indicator) {
          border-radius: 0;
        }
      }
  
      @media (prefers-reduced-motion: no-preference) {
        .game-menu-trigger {
          transition: font-size var(--wa-transition-fast) var(--wa-transition-easing);
        }
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "puzzle-screen": PuzzleScreen;
  }
}
