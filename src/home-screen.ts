import { SignalWatcher } from "@lit-labs/signals";
import { css, html, nothing, unsafeCSS } from "lit";
import { customElement } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import type { FavoriteChangeEvent } from "./catalog-card.ts";
import rawHomeScreenCSS from "./css/home-screen.css?inline";
import { puzzleDataMap, puzzleIds } from "./puzzle/catalog.ts";
import { canonicalBaseUrl, puzzlePageUrl } from "./routing.ts";
import { Screen } from "./screen.ts";
import { savedGames } from "./store/saved-games.ts";
import { settings } from "./store/settings.ts";
import { cssNative, cssWATweaks } from "./utils/css.ts";
import { ScrollAnimationController } from "./utils/scroll-animation-controller.ts";

// Register components
import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/divider/divider.js";
import "@awesome.me/webawesome/dist/components/dropdown/dropdown.js";
import "@awesome.me/webawesome/dist/components/dropdown-item/dropdown-item.js";
import "@awesome.me/webawesome/dist/components/icon/icon.js";
import "./catalog-card.ts";
import "./command-link";
import "./dynamic-content.ts";
import "./head-matter.ts";

@customElement("home-screen")
export class HomeScreen extends SignalWatcher(Screen) {
  constructor() {
    super();
    // Fallback for shrinking sticky header using animation-timeline: scroll()
    new ScrollAnimationController(this, {
      scrollContainer: document.documentElement,
      animationElement: (): Element => this.shadowRoot?.querySelector("header") ?? this,
    });
  }

  protected override render() {
    // Deliberately skip <slot name="header"> and <slot="footer">
    // to substitute our interactive versions for the static ones in index.html.
    return html`
      <head-matter>
        ${this.themeColor ? html`<meta name="theme-color" content=${this.themeColor}>` : nothing}
        ${canonicalBaseUrl ? html`<link rel="canonical" href="${canonicalBaseUrl}">` : nothing}
      </head-matter>

      <header part="header">${
        this.size === "large" ? this.renderWideHeader() : this.renderCompactHeader()
      }</header>

      <div @favorite-change=${this.handleFavoriteChange}>
        ${settings.showIntro ? this.renderIntro() : nothing}
        ${this.renderFavorites()}
        ${this.renderCatalog()}
      </div>
      
      <footer slot="footer">
        <div>Credits, privacy info, copyright notices and licenses are in the
          <command-link command="about" hide-icon>about box</command-link>.</div>
        <div><small>In some countries, names of similar/related puzzles may be
          trademarks belonging to others. Use here does not imply affiliation
          or endorsement by their owners.</small></div>
      </footer>

      <dynamic-content></dynamic-content>
    `;
  }

  private renderWideHeader() {
    // When we have space, render separate title, options menu, and help button
    return html`
      <img class="logo" src="/favicon.svg" alt="" role="presentation">
      <div class="title">
        <h1>Puzzles</h1>
      </div>
      <div class="subtitle">from Simon&nbsp;Tatham’s
        portable&nbsp;puzzle&nbsp;collection and&nbsp;more</div>

      <div class="controls">
        <wa-dropdown>
          <wa-button slot="trigger" appearance="plain" variant="brand" with-caret>
            <wa-icon slot="start" name="options"></wa-icon>
            Options
          </wa-button>
          ${this.renderOptionsMenuContent()}
        </wa-dropdown>
        <wa-button href="help/" appearance="plain" variant="brand">
          <wa-icon name="help" slot="start"></wa-icon>
          Help
        </wa-button>
      </div>
    `;
  }

  private renderCompactHeader() {
    // When space is tight, turn the title into the options menu trigger
    // (but keep the separate help button)
    return html`
      <img class="logo" src="/favicon.svg" alt="" role="presentation">
      <div class="title">
        <wa-dropdown>
          <wa-button slot="trigger" appearance="plain" variant="brand" with-caret>
            <h1>Puzzles</h1>
          </wa-button>
          ${this.renderOptionsMenuContent()}
        </wa-dropdown>
      </div>
      <div class="subtitle">from Simon&nbsp;Tatham’s
        portable&nbsp;puzzle&nbsp;collection and more</div>

      <div class="controls">
        <wa-button href="help/" appearance="plain" variant="brand">${
          this.size === "small"
            ? html`<wa-icon name="help" label="Help"></wa-icon>`
            : html`
                <wa-icon name="help" slot="start"></wa-icon>
                Help
              `
        }</wa-button>
      </div>
    `;
  }

  private renderOptionsMenuContent() {
    // TODO: add view options here
    return html`
      <wa-dropdown-item
          data-command="toggle-intro"
          type="checkbox"
          ?checked=${settings.showIntro}
      >
        Show intro message
      </wa-dropdown-item>
      <wa-divider></wa-divider>
      <wa-dropdown-item data-command="settings">
        <wa-icon slot="icon" name="settings"></wa-icon>
        Preferences
      </wa-dropdown-item>
      <wa-dropdown-item data-command="about">
        <wa-icon slot="icon" name="info"></wa-icon>
        About
      </wa-dropdown-item>
    `;
  }

  private renderIntro() {
    return html`
      <div part="intro">
        <slot name="intro"></slot>
      </div>
    `;
  }

  private renderFavorites() {
    if (settings.favoritePuzzles.size < 1) {
      return nothing;
    }
    const favoriteIds = [...settings.favoritePuzzles].sort();
    return this.renderPuzzleGrid(favoriteIds, "Favorites");
  }

  private renderCatalog() {
    const catalogIds = settings.showUnfinishedPuzzles
      ? puzzleIds
      : puzzleIds.filter((puzzleId) => !puzzleDataMap[puzzleId].unfinished);
    return this.renderPuzzleGrid(
      catalogIds,
      settings.favoritePuzzles.size > 0 ? "All puzzles" : undefined,
    );
  }

  private renderPuzzleGrid(puzzleIds: string[], heading?: string) {
    return html`
      <section part="puzzle-section">
        ${heading ? html`<h2>${heading}</h2>` : nothing}
        <div part="puzzle-grid">
          ${repeat(
            puzzleIds,
            (puzzleId) => puzzleId,
            (puzzleId) => this.renderCatalogCard(puzzleId),
          )}
        </div>
      </section>
    `;
  }

  private renderCatalogCard(puzzleId: string) {
    const { name, description, objective, unfinished } = puzzleDataMap[puzzleId];
    const isFavorite = settings.favoritePuzzles.has(puzzleId);
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

  //
  // Command handling
  //

  protected override registerCommandHandlers() {
    super.registerCommandHandlers();
    Object.assign(this.commandMap, {
      "toggle-intro": this.toggleIntro,
    });
  }

  private toggleIntro() {
    settings.showIntro = !settings.showIntro;
  }

  private async handleFavoriteChange(event: FavoriteChangeEvent) {
    const { puzzleId, isFavorite } = event.detail;
    await settings.setFavoritePuzzle(puzzleId, isFavorite);
  }

  //
  // Styles
  //

  static styles = [
    cssWATweaks,
    cssNative,
    css`${unsafeCSS(rawHomeScreenCSS)}`,
    css`
      :host {
        display: block;
        box-sizing: border-box;
      }
      
      .title wa-button[slot="trigger"] {
        margin-block: calc(
          (var(--wa-font-size-xl) * var(--wa-line-height-condensed) 
           - var(--wa-form-control-height)
          ) / 2
        );
        margin-inline: calc(-1 * (
            var(--wa-form-control-padding-inline) +
            var(--wa-border-width-s))
        );
      }

      [part="puzzle-section"] {
        max-width: 75rem;

        h2 {
          margin-block-end: var(--wa-space-m);
          color: var(--wa-color-text-normal);
          font-weight: var(--wa-font-weight-semibold);
          font-size: var(--wa-font-size-l);
        }
      }

      [part="puzzle-grid"] {
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
    "home-screen": HomeScreen;
  }
}
