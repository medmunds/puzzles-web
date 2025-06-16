import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { AppRouter, HistoryStateProvider } from "./app-router.ts";
import { puzzleDataMap, version } from "./catalog.ts";
import { waitForStableSize } from "./utils/resize.ts";

// Register components
import "./catalog-card.ts";

interface CatalogScreenState {
  scrollY: number; // scrollTop / scrollHeight
}

const isCatalogScreenState = (state: unknown): state is CatalogScreenState =>
  typeof state === "object" &&
  state !== null &&
  "scrollY" in state &&
  typeof state.scrollY === "number";

@customElement("catalog-screen")
export class CatalogScreen extends LitElement implements HistoryStateProvider {
  @property({ type: Object })
  router?: AppRouter;

  @property({ type: Boolean, attribute: "show-unfinished" })
  showUnfinished = false;

  private stateKey = this.localName;

  saveHistoryState = (): CatalogScreenState => ({
    scrollY: this.scrollTop / this.scrollHeight,
  });

  restoreHistoryState = async (state: unknown) => {
    if (!isCatalogScreenState(state)) {
      console.warn("Invalid catalog-screen state in restoreHistoryState", state);
      return;
    }
    await this.updateComplete;

    // It may take time for children to fully render. Repeatedly update
    // the scroll as they do, to minimize appearance of jumping around.
    const { scrollY } = state;
    const restoreScrollPosition = () => {
      this.scrollTop = scrollY * this.scrollHeight;
    };
    restoreScrollPosition();
    await waitForStableSize(this, { resized: restoreScrollPosition });
    restoreScrollPosition();
  };

  override connectedCallback() {
    super.connectedCallback();
    this.router?.registerStateProvider(this.stateKey, this);
  }

  override disconnectedCallback() {
    super.connectedCallback();
    this.router?.unregisterStateProvider(this.stateKey);
  }

  render() {
    return html`
      <header>
        <h1>Puzzles</h1>
        <div class="subtitle">from Simon Tatham's portable puzzle collection</div>
      </header>

      <div class="puzzle-grid">
        ${Object.entries(puzzleDataMap)
          .filter(([_puzzleType, { unfinished }]) => this.showUnfinished || !unfinished)
          .map(
            ([puzzleType, { name, description, objective, unfinished }]) => html`
              <catalog-card 
                puzzle-type=${puzzleType}
                href=${this.router?.reverse({ name: "puzzle", params: { puzzleType } })?.href}
                name=${name}
                description=${description}
                objective=${objective}
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
    `;
  }

  static styles = css`
    :host {
      box-sizing: border-box;
      width: 100%;
      height: 100%;

      max-width: 1200px;
      margin: 0 auto;
      padding: var(--sl-spacing-2x-large);
      overflow-y: auto;

      display: flex;
      flex-direction: column;
      gap: var(--sl-spacing-x-large);
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

    header {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
    }
    header h1 {
      margin-inline-end: 0.5em;
    }

    .puzzle-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
      gap: var(--sl-spacing-x-large);
      align-items: stretch;

      touch-action: manipulation;
    }

    @media (max-width: 768px) {
      .puzzle-grid {
        gap: var(--sl-spacing-medium);
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
