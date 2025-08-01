import { SignalWatcher } from "@lit-labs/signals";
import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { query } from "lit/decorators/query.js";
import type { AppRouter } from "./app-router.ts";
import { type PuzzleData, puzzleDataMap, version } from "./catalog.ts";
import type { HelpViewer } from "./help-viewer.ts";
import type { PuzzleEvent } from "./puzzle/puzzle-context.ts";
import type { SettingsDialog } from "./settings-dialog.ts";
import { savedGames } from "./store/saved-games.ts";
import { settings } from "./store/settings.ts";
import { debounced } from "./utils/timing.ts";

// Register components
import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/divider/divider.js";
import "@shoelace-style/shoelace/dist/components/menu-label/menu-label.js";
import "@shoelace-style/shoelace/dist/components/menu-item/menu-item.js";
import "./head-matter.ts";
import "./help-viewer.ts";
import "./puzzle/puzzle-checkpoints.ts";
import "./puzzle/puzzle-context.ts";
import "./puzzle/puzzle-game-menu.ts";
import "./puzzle/puzzle-keys.ts";
import "./puzzle/puzzle-preset-menu.ts";
import "./puzzle/puzzle-view-interactive.ts";
import "./puzzle/puzzle-end-notification.ts";
import "./settings-dialog.ts";

@customElement("puzzle-screen")
export class PuzzleScreen extends SignalWatcher(LitElement) {
  @property({ type: Object })
  router?: AppRouter;

  /** The puzzle type, e.g. "blackbox" */
  @property({ type: String, attribute: "puzzle-type" })
  puzzleType = "";

  @property({ type: String, attribute: "puzzle-params" })
  puzzleParams = "";

  @state()
  private puzzleData?: PuzzleData;

  @state()
  private puzzleLoaded = false;

  @query("help-viewer", true)
  private helpPanel?: HelpViewer;

  @query("settings-dialog", true)
  private preferencesDialog?: SettingsDialog;

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
          params=${this.puzzleParams} 
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
            <puzzle-game-menu @sl-select=${this.handleGameMenuCommand}>
              <sl-menu-item value="preferences">
                <sl-icon slot="prefix" name="settings"></sl-icon>
                Preferences…
              </sl-menu-item>
              <sl-divider></sl-divider>
              <sl-menu-item value="catalog">
                <sl-icon slot="prefix" name="back-to-catalog"></sl-icon>
                Other puzzles
              </sl-menu-item>
              <sl-divider></sl-divider>
              <sl-menu-item value="redraw">Redraw puzzle</sl-menu-item>
              <sl-menu-label class="version">v${version}</sl-menu-label>
            </puzzle-game-menu>
            <puzzle-preset-menu></puzzle-preset-menu>
            <sl-button href=${helpUrl} @click=${this.showHelp}>
              <sl-icon slot="prefix" name="help"></sl-icon>
              Help
            </sl-button>
          </div>

          <puzzle-view-interactive 
              tabIndex="0"
              role="figure"
              aria-label="interactive puzzle displayed as an image"
              ?longPress=${settings.rightButtonLongPress}
              ?twoFingerTap=${settings.rightButtonTwoFingerTap}
              secondaryButtonHoldTime=${settings.rightButtonHoldTime}
              secondaryButtonDragThreshold=${settings.rightButtonDragThreshold}
              ?maximize=${settings.maximizePuzzleSize !== 0}
              .resizeElement=${
                // puzzle-view observes its own size, but we also want it to grow
                // when we're getting larger (without enabling flex-grow).
                this
              }
          ></puzzle-view-interactive>

          <!-- Directly after puzzle-view so it's next in the tab order
               after completing a game via physical keyboard -->
          <puzzle-end-notification>
            <sl-button 
                slot="extra-actions-solved" 
                @click=${this.handleChangeType}
              >
              <sl-icon slot="prefix" name="puzzle-type"></sl-icon>
              Change type
            </sl-button>
            <sl-button 
                slot="extra-actions-solved" 
                href=${otherPuzzlesUrl}
              >
              <sl-icon slot="prefix" name="back-to-catalog"></sl-icon>
              Other puzzles
            </sl-button>
          </puzzle-end-notification>

          <puzzle-keys>
            <puzzle-checkpoints slot="after"></puzzle-checkpoints>
          </puzzle-keys>
        </div>

        <settings-dialog puzzle-name=${this.puzzleData.name}></settings-dialog>
      </puzzle-context>

      <help-viewer src=${helpUrl} label=${`${this.puzzleData.name} Help`}></help-viewer>
    `;
  }

  private async handleGameMenuCommand(event: CustomEvent<{ item: { value: string } }>) {
    const value = event.detail.item.value;
    switch (value) {
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

    const params = await settings.getParams(puzzle.puzzleId);
    if (params) {
      const error = await puzzle.setParams(params);
      if (error) {
        console.warn(
          `Error setting puzzle ${puzzle.puzzleId} params to saved "${params}": ` +
            `${error}. Discarding.`,
        );
        await settings.setParams(puzzle.puzzleId, undefined);
      }
    }

    // TODO: restore custom presets from settings

    if (!this.autoSaveId) {
      this.autoSaveId = await savedGames.findMostRecentAutoSave(puzzle.puzzleId);
    }

    let restored = false;
    if (this.autoSaveId) {
      restored = await savedGames.restoreAutoSavedGame(puzzle, this.autoSaveId);
    }
    if (!restored) {
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
      --app-padding: var(--sl-spacing-x-large);
      --app-spacing: var(--sl-spacing-large);

      @container (max-width: 40rem) {
        --app-padding: var(--sl-spacing-large);
        --app-spacing: var(--sl-spacing-medium);
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
      }
      
      .toolbar {
        max-width: calc(100% - 2 * var(--app-padding));
      }

      @media (prefers-reduced-motion: no-preference) {
        transition:
            gap var(--sl-transition-fast) ease-in-out,
            padding var(--sl-transition-fast) ease-in-out;
        & > * {
          transition: margin var(--sl-transition-fast) ease-in-out;
        }
      }

      background-color: var(--sl-color-neutral-200);
      color: var(--sl-color-neutral-900);
    }

    h1 {
      margin: 0;
      color: var(--sl-color-neutral-800);
      font-weight: var(--sl-font-weight-bold);
      font-size: var(--sl-font-size-x-large);
      line-height: var(--sl-line-height-dense);
    }
    .subtitle {
      font-size: var(--sl-font-size-medium);
      font-weight: var(--sl-font-weight-normal);
      color: var(--sl-color-neutral-700);
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
      gap: var(--sl-spacing-small);
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
      background-color: var(--sl-color-neutral-50);
      border-radius: var(--sl-border-radius-medium);
      --padding: var(--sl-spacing-medium);
    }
    
    @container (max-width: 25rem) {
      .app puzzle-view-interactive {
        margin: 0;
        border-radius: 0;
        min-width: 100%;
        --padding: var(--sl-spacing-large); /* --app-padding */
      }
    }

    sl-menu-label.version::part(base) {
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
