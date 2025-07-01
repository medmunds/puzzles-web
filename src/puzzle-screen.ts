import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { query } from "lit/decorators/query.js";
import type { AppRouter, HistoryStateProvider } from "./app-router.ts";
import { type PuzzleData, puzzleDataMap, version } from "./catalog.ts";
import type { HelpViewer } from "./help-viewer.ts";
import type { PuzzleConfigChangeEvent } from "./puzzle/puzzle-config.ts";
import type { PuzzleEvent } from "./puzzle/puzzle-context.ts";
import { store } from "./store.ts";

// Register components
import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/divider/divider.js";
import "@shoelace-style/shoelace/dist/components/menu-label/menu-label.js";
import "@shoelace-style/shoelace/dist/components/menu-item/menu-item.js";
import "./head-matter.ts";
import "./help-viewer.ts";
import "./puzzle/puzzle-context.ts";
import "./puzzle/puzzle-display-name.ts";
import "./puzzle/puzzle-game-menu.ts";
import "./puzzle/puzzle-keys.ts";
import "./puzzle/puzzle-preset-menu.ts";
import "./puzzle/puzzle-view-interactive.ts";
import "./puzzle/puzzle-end-notification.ts";

interface PuzzleScreenState {
  puzzleId: string;
  autoSaveId?: string;
}

const isPuzzleScreenState = (state: unknown): state is PuzzleScreenState =>
  typeof state === "object" &&
  state !== null &&
  "puzzleId" in state &&
  typeof state.puzzleId === "string" &&
  "autoSaveId" in state &&
  (typeof state.autoSaveId === "string" || state.autoSaveId === undefined);

@customElement("puzzle-screen")
export class PuzzleScreen extends LitElement implements HistoryStateProvider {
  @property({ type: Object })
  router?: AppRouter;

  /** The puzzle type, e.g. "blackbox" */
  @property({ type: String, attribute: "puzzle-type" })
  puzzleType = "";

  @property({ type: String, attribute: "puzzle-params" })
  puzzleParams = "";

  @state()
  private puzzleData?: PuzzleData;

  @query("help-viewer") // TODO: cache?
  private helpPanel?: HelpViewer;

  private stateKey = this.localName;

  private autoSaveId?: string;

  saveHistoryState = (): PuzzleScreenState => ({
    puzzleId: this.puzzleType,
    autoSaveId: this.autoSaveId,
  });

  restoreHistoryState = async (state: unknown) => {
    if (isPuzzleScreenState(state) && state.puzzleId === this.puzzleType) {
      this.autoSaveId = state.autoSaveId;
      // TODO: there's maybe a race condition here with puzzle-loaded?
    }
  };

  override connectedCallback() {
    super.connectedCallback();
    this.router?.registerStateProvider(this.stateKey, this);
  }

  override disconnectedCallback() {
    super.connectedCallback();
    this.router?.unregisterStateProvider(this.stateKey);
  }

  protected override async willUpdate(changedProperties: Map<string, unknown>) {
    if (changedProperties.has("puzzleType") && this.puzzleType) {
      const data = puzzleDataMap[this.puzzleType];
      if (!data) {
        throw new Error(`Unknown puzzle type ${this.puzzleType}`);
      }
      this.puzzleData = data;
      this.autoSaveId = undefined;
    }
  }

  override render() {
    if (!this.puzzleData) {
      console.warn("PuzzleScreen.render without puzzleData");
      return;
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
          @puzzle-game-state-change=${this.handlePuzzleGameStateChange}
          @puzzle-preferences-change=${this.handlePreferencesChange}
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
            <h1>
              <puzzle-display-name></puzzle-display-name>
              <span class="subtitle">from Simon Tatham's portable puzzles collection</span>
            </h1>
          </header>

          <div class="toolbar">
            <puzzle-game-menu @sl-select=${this.handleGameMenuCommand}>
              <sl-divider></sl-divider>
              <sl-menu-item value="catalog">
                <sl-icon slot="prefix" name="back-to-catalog"></sl-icon>
                Other puzzles
              </sl-menu-item>
              <sl-divider></sl-divider>
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
              maximize
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

          <puzzle-keys></puzzle-keys>
        </div>
      </puzzle-context>

      <help-viewer src=${helpUrl} label=${`${this.puzzleData.name} Help`}></help-viewer>
    `;
  }

  private handleGameMenuCommand(event: CustomEvent<{ item: { value: string } }>) {
    const value = event.detail.item.value;
    switch (value) {
      case "catalog":
        this.router?.navigate(this.router.defaultRoute);
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

    const prefs = await store.getPuzzlePreferences(puzzle.puzzleId);
    await puzzle.setPreferences(prefs);

    // TODO: restore custom presets, current game type from settings

    if (!this.autoSaveId) {
      this.autoSaveId = await store.findMostRecentAutoSave(puzzle.puzzleId);
    }

    if (this.autoSaveId) {
      await store.restoreAutoSavedGame(puzzle, this.autoSaveId);
    } else {
      await puzzle.newGame();
    }
    await this.shadowRoot?.querySelector("puzzle-context")?.updateComplete;
  }

  private async handlePuzzleGameStateChange(event: PuzzleEvent) {
    const { puzzle } = event.detail;
    // TODO: somehow skip autosave during newGame/restoreGame
    //   (to avoid storing & showing "resume" for unplayed puzzles)
    if (puzzle.currentGameId) {
      if (!puzzle.isSolved) {
        this.autoSaveId ??= store.makeAutoSaveId();
        // TODO: throttle auto saving to 500 or 1000 ms or longer
        await store.autoSaveGame(puzzle, this.autoSaveId);
      } else if (this.autoSaveId) {
        // Puzzle is solved; no need to keep the autosave around
        await store.removeAutoSavedGame(puzzle, this.autoSaveId);
      }
    }
  }

  private async handlePreferencesChange(event: PuzzleConfigChangeEvent) {
    // Persist only the changed preferences to the DB
    await store.setPuzzlePreferences(this.puzzleType, event.detail.changes);
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
      display: block;
      font-size: var(--sl-font-size-small);
      font-weight: var(--sl-font-weight-normal);
      color: var(--sl-color-neutral-600);
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
