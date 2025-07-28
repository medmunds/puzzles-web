import { SignalWatcher } from "@lit-labs/signals";
import { LitElement, css, html } from "lit";
import { customElement, eventOptions, property, query } from "lit/decorators.js";
import type { AppRouter } from "./app-router.ts";
import { puzzleDataMap, version } from "./catalog.ts";
import { savedGames } from "./store/saved-games.ts";
import { waitForStableSize } from "./utils/resize.ts";
import { debounced } from "./utils/timing.ts";

// Register components
import "./catalog-card.ts";

@customElement("catalog-screen")
export class CatalogScreen extends SignalWatcher(LitElement) {
  @property({ type: Object })
  router?: AppRouter;

  @property({ type: Boolean, attribute: "show-unfinished" })
  showUnfinished = false;

  @query(".app", true)
  private appElement?: HTMLDivElement;

  protected override render() {
    return html`
      <div class="app" @scroll=${this.handleAppScroll}>
        <header>
          <h1>Puzzles</h1>
          <div class="subtitle">from Simon Tatham’s portable puzzle collection</div>
        </header>
  
        <div class="puzzle-grid">
          ${Object.entries(puzzleDataMap)
            .filter(
              ([_puzzleType, { unfinished }]) => this.showUnfinished || !unfinished,
            )
            .map(
              ([puzzleType, { name, description, objective, unfinished }]) => html`
                <catalog-card 
                  puzzle-type=${puzzleType}
                  href=${this.router?.reverse({ name: "puzzle", params: { puzzleType } })?.href}
                  name=${name}
                  description=${description}
                  objective=${objective}
                  ?resume=${savedGames.autoSavedPuzzles.has(puzzleType)}
                  ?unfinished=${unfinished}
                ></catalog-card>
              `,
            )}
        </div>
  
        <footer>
          <h2>About this collection</h2>
          <p>This is Mike Edmunds' adaptation of Simon Tatham's
            <a href="https://www.chiark.greenend.org.uk/~sgtatham/puzzles/">portable puzzles
              collection</a>. The original collection includes
            <a href="https://www.chiark.greenend.org.uk/~sgtatham/puzzles/doc/">full rules</a>
            and documentation for playing the puzzles.</p>
          <p>The <a href="https://github.com/medmunds/puzzles">source code</a>
            for this project is on GitHub. You can report any problems in the
            <a href="https://github.com/medmunds/puzzles/issues">issue tracker</a>.</p>
          <p>Both the original puzzles and this adaptation are released under
            the MIT License. See the LICENSE file in the source for more details.</p>
          <p class="version">v${version}</p>
        </footer>
      </div>
    `;
  }

  protected override async firstUpdated() {
    // Restore the scroll position if in history state.
    // (It's not clear why browser's native scroll restoration doesn't work.)
    const { catalogScrollY } = window.history.state ?? {};
    if (typeof catalogScrollY === "number") {
      await this.updateComplete;
      if (!this.appElement) {
        return;
      }
      // It may take time for children to fully render. Repeatedly update
      // the scroll as they do, to minimize appearance of jumping around.
      const restoreScrollPosition = () => {
        if (this.appElement) {
          this.appElement.scrollTop = catalogScrollY * this.appElement.scrollHeight;
        }
      };
      restoreScrollPosition();
      await waitForStableSize(this.appElement, { resized: restoreScrollPosition });
      restoreScrollPosition();
    }
  }

  @eventOptions({ passive: true })
  @debounced(100)
  handleAppScroll() {
    // Record the scroll position for restoration in firstUpdated.
    if (this.appElement?.scrollHeight) {
      const newState = {
        ...window.history.state,
        catalogScrollY: this.appElement.scrollTop / this.appElement.scrollHeight,
      };
      window.history.replaceState(newState, "");
    }
  }

  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      container-type: size;
    }
    
    .app {
      width: 100%;
      height: 100%;

      --app-padding: var(--sl-spacing-x-large);
      --app-spacing: var(--sl-spacing-large);

      box-sizing: border-box;
      max-width: 75rem;
      margin: 0 auto;
      padding: var(--app-padding);
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;

      display: flex;
      flex-direction: column;
      gap: var(--app-spacing);

      @media (prefers-reduced-motion: no-preference) {
        transition:
            gap var(--sl-transition-fast) ease-in-out,
            padding var(--sl-transition-fast) ease-in-out;
      }
    }

    @container (max-width: 40rem) {
      .app {
        --app-padding: var(--sl-spacing-large);
        --app-spacing: var(--sl-spacing-medium);
      }
    }

    h1,
    h2 {
      margin: 0;
      color: var(--sl-color-neutral-800);
    }

    h1 {
      font-weight: var(--sl-font-weight-bold);
      font-size: var(--sl-font-size-x-large);
    }
    h2 {
      font-weight: var(--sl-font-weight-semibold);
      font-size: var(--sl-font-size-large);
    }

    p {
      margin: var(--sl-spacing-medium) 0 0 0;
      font-size: var(--sl-font-size-medium);
      font-weight: var(--sl-font-weight-normal);
    }

    .subtitle {
      font-size: var(--sl-font-size-medium);
      font-weight: var(--sl-font-weight-normal);
      color: var(--sl-color-neutral-700);
    }

    header {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
    }
    header h1 {
      margin-inline-end: 0.5em;
      line-height: var(--sl-line-height-dense);    
    }

    .puzzle-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
      gap: var(--app-spacing);
      align-items: stretch;

      touch-action: manipulation;

      @media (prefers-reduced-motion: no-preference) {
        transition:
            gap var(--sl-transition-fast) ease-in-out;
      }
    }

    .version {
      font-size: var(--sl-font-size-small);
      color: var(--sl-color-neutral-500);
      
      /* Allow selecting the version info */
      -moz-user-select: all;
      -webkit-user-select: all;
      user-select: all;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "catalog-screen": CatalogScreen;
  }
}
