import { SignalWatcher } from "@lit-labs/signals";
import { css, html, LitElement, type TemplateResult } from "lit";
import { query } from "lit/decorators/query.js";
import { customElement, property, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import { type PuzzleData, puzzleDataMap } from "./puzzle/catalog.ts";
import type { Puzzle } from "./puzzle/puzzle.ts";
import type { PuzzleEvent } from "./puzzle/puzzle-context.ts";
import { helpUrl, indexPageUrl, navigateToIndexPage } from "./routing.ts";
import { savedGames } from "./store/saved-games.ts";
import { settings } from "./store/settings.ts";
import { cssWATweaks } from "./utils/css.ts";
import { notifyError } from "./utils/errors.ts";
import { preventDoubleTapZoomOnButtons } from "./utils/events.ts";
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
export class PuzzleScreen extends SignalWatcher(LitElement) {
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

  @state()
  private themeColor?: string;

  @query("dynamic-content")
  private dynamicContent?: HTMLElementTagNameMap["dynamic-content"];

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
    const { puzzleAutoSaveFilename, puzzleAutoSavePuzzleId } =
      window.history.state ?? {};
    if (
      typeof puzzleAutoSaveFilename === "string" &&
      puzzleAutoSavePuzzleId === this.puzzleId
    ) {
      this._autoSaveFilename = puzzleAutoSaveFilename;
    }
    this.themeColor = window
      .getComputedStyle(this)
      .getPropertyValue("--puzzle-theme-color");
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
    }
  }

  override render() {
    if (!this.puzzleData) {
      throw new Error("PuzzleScreen.render without puzzleData");
    }

    const iconUrl = new URL(`./assets/icons/${this.puzzleId}-64d8.png`, import.meta.url)
      .href;
    const otherPuzzlesUrl = indexPageUrl().href;

    return html`
      <puzzle-context 
          puzzleid=${this.puzzleId}
          @click=${preventDoubleTapZoomOnButtons}
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
          ${when(this.themeColor, () => html`<meta name="theme-color" content=${this.themeColor}>`)}
          <link rel="icon" href=${iconUrl}>
        </head-matter>
        
        <main>
          <header>
            ${this.renderGameMenu()}
            <puzzle-preset-menu
                trigger-appearance="filled" trigger-variant="brand"
            ></puzzle-preset-menu>
            <wa-button
                appearance="filled" variant="brand"
                href=${helpUrl(this.puzzleId).href} 
                @click=${this.showHelp}
            >
              <wa-icon slot="start" name="help"></wa-icon>
              Help
            </wa-button>
          </header>

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
              max-scale=${settings.maxScale}
          >
            <wa-skeleton slot="loading" effect="sheen"></wa-skeleton>
          </puzzle-view-interactive>

          <footer>
            <puzzle-keys></puzzle-keys>
            <puzzle-history></puzzle-history>
          </footer>
        </main>

        <puzzle-end-notification>
          <wa-button
              slot="extra-actions-solved"
              @click=${this.handleChangeType}
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

        <dynamic-content></dynamic-content>
      </puzzle-context>
    `;
  }

  private renderGameMenu(): TemplateResult {
    const iconName = this.puzzleData?.unfinished ? "unfinished" : "game";
    return html`
      <wa-dropdown @wa-select=${this.handleGameMenuCommand}>
        <wa-button 
            slot="trigger" 
            class="game-menu-trigger" 
            appearance="filled" variant="brand" 
            with-caret
        >
          <wa-icon slot="start" name=${iconName}></wa-icon>
          ${this.puzzleData?.name ?? "Game"}
        </wa-button>
        <wa-dropdown-item value="new">
          <wa-icon slot="icon" name="new-game"></wa-icon>
          New game
        </wa-dropdown-item>
        <wa-dropdown-item value="restart">
          <wa-icon slot="icon" name="restart-game"></wa-icon>
          Restart game
        </wa-dropdown-item>
        ${when(
          this.puzzle?.canSolve,
          () =>
            html`
                  <wa-dropdown-item value="solve" ?disabled=${this.puzzle?.status === "solved"}>
                    <wa-icon slot="icon" name="show-solution"></wa-icon>
                    Solve
                  </wa-dropdown-item>
                `,
        )}
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
        <wa-dropdown-item value="about">
          <wa-icon slot="icon" name="info"></wa-icon>
          About
        </wa-dropdown-item>
        <wa-divider></wa-divider>
        <wa-dropdown-item value="redraw">Redraw puzzle</wa-dropdown-item>
      </wa-dropdown>
    `;
  }

  private async handleGameMenuCommand(event: CustomEvent<{ item: { value: string } }>) {
    const value = event.detail.item.value;
    switch (value) {
      case "new":
        await this.puzzle?.newGame();
        break;
      case "restart":
        await this.puzzle?.restartGame();
        break;
      case "solve":
        await this.puzzle?.solve();
        break;
      case "share":
        await this.showShareDialog();
        break;
      case "load":
        await this.showLoadGameDialog();
        break;
      case "save":
        await this.showSaveGameDialog();
        break;
      case "gameid":
        await this.showEnterGameIDDialog();
        break;
      case "about":
        await this.showAboutDialog();
        break;
      case "catalog":
        navigateToIndexPage();
        break;
      case "preferences":
        await this.showSettingsDialog();
        break;
      case "redraw":
        // TODO: Remove the "redraw" command (added for debugging Safari)
        this.shadowRoot?.querySelector("puzzle-view-interactive")?.redraw();
        break;
      default:
        if (!import.meta.env.PROD) {
          throw new Error(`Unknown game menu command: ${value}`);
        }
        break;
    }
  }

  private async showShareDialog() {
    await import("./share-dialog.ts");
    const dialog = await this.dynamicContent?.addItem({
      tagName: "share-dialog",
      render: () => html`<share-dialog></share-dialog>`,
    });
    if (dialog && !dialog.open) {
      await dialog.reset();
      dialog.open = true;
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

  private async showAboutDialog() {
    await import("./about-dialog.ts");
    const dialog = await this.dynamicContent?.addItem({
      tagName: "about-dialog",
      render: () => html`<about-dialog></about-dialog>`,
    });
    if (dialog && !dialog.open) {
      dialog.open = true;
    }
  }

  private async showSettingsDialog() {
    await import("./settings-dialog.ts");
    const dialog = await this.dynamicContent?.addItem({
      tagName: "settings-dialog",
      render: () => html`<settings-dialog></settings-dialog>`,
    });
    if (dialog && !dialog.open) {
      await dialog.show();
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

  private async showHelp(event: UIEvent) {
    event.preventDefault();
    await import("./help-viewer.ts");
    const helpViewer = await this.dynamicContent?.addItem({
      tagName: "help-viewer",
      render: () => html`
        <help-viewer 
            src=${helpUrl(this.puzzleId).href} 
            label=${`${this.puzzleData?.name} Help`}
        ></help-viewer>
      `,
    });
    helpViewer?.show();
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

  //
  // Styles
  //

  static styles = [
    cssWATweaks,
    css`
      :host {
        display: block;
        width: 100%;
        height: 100%;
        container-type: size;
        
        --puzzle-theme-color: var(--wa-color-brand-fill-normal);
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
        gap: var(--wa-space-s);
  
        > *:last-child {
          margin-inline-start: auto;
        }
      }
  
      header {
        align-items: baseline;
        padding: var(--wa-space-xs);
        background-color: var(--puzzle-theme-color);
        
        wa-button[appearance="filled"]::part(base),
        puzzle-preset-menu::part(trigger-base) {
          color: var(--wa-color-text-normal);
        }
      }
  
      puzzle-view-interactive {
        flex: 1 1 auto;
        min-height: 5rem; /* allows flexing */
        margin-block: var(--wa-space-m);
        margin-inline: var(--wa-space-l);
  
        --spacing: var(--wa-space-m);
        --background-color: var(--wa-color-surface-default);
        --border-radius: var(--wa-form-control-border-radius);
      }
  
      footer {
        align-items: end;
        padding-inline: var(--wa-space-l);
        padding-block-end: var(--wa-space-l);
      }
        
      @container (min-width: 40rem) {
        .game-menu-trigger {
          font-size: var(--wa-font-size-l);
        }
        puzzle-view-interactive {
          margin-block: var(--wa-space-l);
          margin-inline: var(--wa-space-xl);
          --spacing: var(--wa-space-l);
        }
        footer {
          padding-inline: var(--wa-space-xl);
          padding-block-end: var(--wa-space-xl);
        }
      }
      @container (max-width: 25rem) {
        puzzle-view-interactive {
          margin-inline: 0;
          min-width: 100%;
        }
      }
  
      puzzle-preset-menu {
        flex: 0 1 auto;
        min-width: 5rem;
      }
  
      wa-skeleton {
        --color: var(--wa-color-neutral-fill-quiet);
        --sheen-color: var(--wa-color-brand-fill-quiet);
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
