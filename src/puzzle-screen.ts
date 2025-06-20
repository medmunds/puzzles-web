import { ResizeController } from "@lit-labs/observers/resize-controller.js";
import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { query } from "lit/decorators/query.js";
import type { AppRouter } from "./app-router.ts";
import { type PuzzleData, puzzleDataMap, version } from "./catalog.ts";
import type { HelpViewer } from "./help-viewer.ts";

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

@customElement("puzzle-screen")
export class PuzzleScreen extends LitElement {
  @property({ type: Object })
  router?: AppRouter;

  /** The puzzle type, e.g. "blackbox" */
  @property({ type: String, attribute: "puzzle-type" })
  puzzleType = "";

  @property({ type: String, attribute: "puzzle-params" })
  puzzleParams = "";

  @state()
  private puzzleData?: PuzzleData;

  @query("help-viewer")
  private helpPanel?: HelpViewer;

  constructor() {
    super();
    // puzzle-view observes its own size, but we also want it to grow
    // when we're getting larger (without enabling flex-grow).
    new ResizeController(this, {
      callback: async () => {
        const puzzleView = this.shadowRoot?.querySelector("puzzle-view-interactive");
        if (puzzleView?.maximize) {
          await puzzleView.resize(false);
        }
      },
    });
  }

  willUpdate(changedProperties: Map<string, unknown>) {
    if (changedProperties.has("puzzleType") && this.puzzleType) {
      const data = puzzleDataMap[this.puzzleType];
      if (!data) {
        throw new Error(`Unknown puzzle type ${this.puzzleType}`);
      }
      this.puzzleData = data;
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
      <puzzle-context type=${this.puzzleType} params=${this.puzzleParams}>
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
              <sl-menu-item value="checkpoint" disabled>Checkpoint</sl-menu-item>
              <sl-divider></sl-divider>
              <sl-menu-item value="share" disabled>Share…</sl-menu-item>
              <sl-menu-item value="save" disabled>Save…</sl-menu-item>
              <sl-menu-item value="load" disabled>Load…</sl-menu-item>
              <sl-divider></sl-divider>
              <sl-menu-item value="catalog">
                <sl-icon slot="prefix" name="arrow-left"></sl-icon>
                Other puzzles
              </sl-menu-item>
              <sl-divider></sl-divider>
              <sl-menu-label class="version">v${version}</sl-menu-label>
            </puzzle-game-menu>
            <puzzle-preset-menu></puzzle-preset-menu>
            <sl-button href=${helpUrl} @click=${this.showHelp}>Help</sl-button>
          </div>

          <puzzle-view-interactive 
              tabIndex="0"
              role="figure"
              aria-label="interactive puzzle displayed as an image"
              maximize
          ></puzzle-view-interactive>

          <div class="puzzle-end-notification-holder">
            <!-- Directly after puzzle-view so it's next in the tab order
                 after completing a game via physical keyboard -->
            <puzzle-end-notification>
              <sl-button 
                  slot="extra-actions-solved" 
                  @click=${this.handleChangeType}
                >Change type</sl-button>
              <sl-button 
                  slot="extra-actions-solved" 
                  href=${otherPuzzlesUrl}
                >Other puzzles</sl-button>
            </puzzle-end-notification>
          </div>

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

    .puzzle-end-notification-holder {
      position: absolute;
      left: 0;
      right: 0;
      top: 0;
      bottom: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;

      puzzle-end-notification {
        pointer-events: auto;
        z-index: 1;
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
