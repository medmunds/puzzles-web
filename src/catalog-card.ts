import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";

// Register components
import "@shoelace-style/shoelace/dist/components/badge/badge.js";
import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/card/card.js";

@customElement("catalog-card")
export class CatalogCard extends LitElement {
  @property({ type: String, attribute: "puzzle-type" })
  puzzleType = "";

  @property({ type: String })
  name = "";

  @property({ type: String })
  description = "";

  @property({ type: String })
  objective = "";

  @property({ type: Boolean })
  unfinished = false;

  @property({ type: String })
  href = "";

  renderIcon() {
    if (this.unfinished) {
      // Unfinished puzzles don't have icons yet
      return html`<div class="icon unfinished" role="presentation">🚧</div>`;
    }

    const icon1x = `/src/assets/icons/${this.puzzleType}-64d24.png`;
    const icon2x = `/src/assets/icons/${this.puzzleType}-128d24.png`;
    const srcset = `${icon1x}, ${icon2x} 2x`;
    return html`
      <img class="icon" srcset=${srcset} src=${icon2x}
           role="presentation" alt=${`Preview image of ${this.name}`}
      >`;
  }

  render() {
    return html`
      <sl-card>
        <div class="card-body">
          ${this.renderIcon()}
          <div class="text">
            ${this.unfinished ? html`<sl-badge pill variant="warning">Unfinished</sl-badge>` : undefined}
            <h2>${this.name}</h2>
            <p>${this.objective}</p>
          </div>
        </div>

        <footer slot="footer">
          <sl-button 
              id="play" 
              href="${this.href}" 
              aria-label=${`Play ${this.name}`} 
              variant="primary"
          >Play</sl-button>
        </footer>
      </sl-card>
    `;
  }

  static styles = css`
    :host {
      display: block;
      touch-action: manipulation;
      --icon-size: 64px;
    }

    @media (hover: hover) {
      @media (prefers-reduced-motion: no-preference) {
        sl-card {
          transition: transform var(--sl-transition-medium) ease-in-out,
          box-shadow var(--sl-transition-medium) ease-in-out;
        }

        sl-card:hover {
          transform: translateY(calc(-1 * var(--sl-spacing-2x-small)));
          box-shadow: var(--sl-shadow-large);
        }
      }
    }

    sl-card {
      height: 100%;
      width: 100%;
      position: relative;
      --padding: var(--sl-spacing-medium);

      cursor: pointer;
    }

    sl-card::part(base) {
      height: 100%;
    }

    sl-card::part(body) {
      flex-grow: 1;
    }

    sl-card::part(footer) {
      /* Remove the separator line */
      border-block-start: none;
      padding-block-start: 0;
    }

    .card-body {
      display: flex;
      flex-direction: row;
      gap: var(--sl-spacing-medium);
    }

    .icon {
      display: block;
      width: var(--icon-size);
      height: var(--icon-size);
      border-radius: var(--sl-border-radius-small);
    }

    .icon.unfinished {
      text-align: center;
      line-height: var(--icon-size);
      font-size: calc(0.8 * var(--icon-size));
    }

    sl-badge {
      /* WEB-56239: */ /*noinspection CssInvalidPropertyValue*/ 
      float: inline-end;
      margin-inline-start: var(--sl-spacing-2x-small);
      margin-block-end: var(--sl-spacing-2x-small);
    }

    h2 {
      margin: 0;
      line-height: 1;
      color: var(--sl-color-neutral-800);
      font-size: var(--sl-font-size-large);
      font-weight: var(--sl-font-weight-semibold);
    }

    p {
      margin: var(--sl-spacing-small) 0 0 0;
      color: var(--sl-color-neutral-700);
      font-size: var(--sl-font-size-medium);
      font-weight: var(--sl-font-weight-normal);
      line-height: var(--sl-line-height-dense);
    }

    footer {
      display: flex;
      justify-content: flex-end;
    }

  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "catalog-card": CatalogCard;
  }
}
