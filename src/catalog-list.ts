import { SignalWatcher } from "@lit-labs/signals";
import { css, html, LitElement, nothing } from "lit";
import { customElement } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import type { FavoriteChangeEvent } from "./catalog-card.ts";
import { puzzleDataMap } from "./puzzle/catalog.ts";
import { puzzlePageUrl } from "./routing.ts";
import { savedGames } from "./store/saved-games.ts";
import { settings } from "./store/settings.ts";
import { cssWATweaks } from "./utils/css.ts";

// Register components
import "./catalog-card.ts";

@customElement("catalog-list")
export class CatalogList extends SignalWatcher(LitElement) {
  protected override render() {
    const favorites = settings.favoritePuzzles;
    let puzzleIds = Object.keys(puzzleDataMap);
    if (!settings.showUnfinishedPuzzles) {
      puzzleIds = puzzleIds.filter((puzzleId) => !puzzleDataMap[puzzleId].unfinished);
    }

    return html`
      <div class="app" 
           @favorite-change=${this.handleFavoriteChange}
      >
        ${
          favorites.size > 0
            ? html`
              <h2>Favorites</h2>
              <div class="puzzle-grid">
                ${repeat(
                  [...favorites].sort(),
                  (puzzleId) => puzzleId,
                  (puzzleId) => this.renderCatalogCard(puzzleId, true),
                )}
              </div>
              <h2>All puzzles</h2>
            `
            : nothing
        }

        <div class="puzzle-grid">
          ${repeat(
            puzzleIds,
            (puzzleId) => puzzleId,
            (puzzleId) => this.renderCatalogCard(puzzleId, favorites.has(puzzleId)),
          )}
        </div>
      </div>
    `;
  }

  private renderCatalogCard(puzzleId: string, isFavorite: boolean) {
    const { name, description, objective, unfinished } = puzzleDataMap[puzzleId];
    const href = puzzlePageUrl({ puzzleId });
    return html`
      <catalog-card
        puzzleid=${puzzleId}
        href=${href}
        name=${name}
        description=${description}
        objective=${objective}
        ?game-in-progress=${savedGames.autoSavedPuzzles.has(puzzleId)}
        ?favorite=${isFavorite}
        ?unfinished=${unfinished}
      ></catalog-card>                    
    `;
  }

  private async handleFavoriteChange(event: FavoriteChangeEvent) {
    const { puzzleId, isFavorite } = event.detail;
    await settings.setFavoritePuzzle(puzzleId, isFavorite);
  }

  static styles = [
    cssWATweaks,
    css`
      :host {
        display: block;
      }
      
      .app {
        box-sizing: border-box;
        max-width: 75rem;
        margin: 0 auto;
        padding: var(--app-padding);
  
        display: flex;
        flex-direction: column;
        gap: var(--app-spacing);
  
        @media (prefers-reduced-motion: no-preference) {
          transition:
              gap var(--wa-transition-fast)  var(--wa-transition-easing),
              padding var(--wa-transition-fast)  var(--wa-transition-easing);
        }
      }
  
      h2 {
        margin: 0;
        color: var(--wa-color-text-normal);
        font-weight: var(--wa-font-weight-semibold);
        font-size: var(--wa-font-size-l);
      }
  
      .puzzle-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
        gap: var(--app-spacing);
        align-items: stretch;
  
        touch-action: manipulation;
  
        @media (prefers-reduced-motion: no-preference) {
          transition:
              gap var(--wa-transition-fast)  var(--wa-transition-easing);
        }
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "catalog-list": CatalogList;
  }
}
