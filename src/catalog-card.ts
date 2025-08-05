import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";

// Register components
import "@awesome.me/webawesome/dist/components/badge/badge.js";
import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/card/card.js";

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

  @property({ type: Boolean })
  resume = false;

  renderIcon() {
    if (this.unfinished) {
      // Unfinished puzzles don't have icons yet
      return html`<div class="icon unfinished" role="presentation">🚧</div>`;
    }

    const icon1x = new URL(
      `./assets/icons/${this.puzzleType}-64d8.png`,
      import.meta.url,
    ).href;
    const icon2x = new URL(
      `./assets/icons/${this.puzzleType}-128d8.png`,
      import.meta.url,
    ).href;
    const srcset = `${icon1x}, ${icon2x} 2x`;
    return html`
      <img class="icon" srcset=${srcset} src=${icon2x}
           role="presentation" alt=${`Preview image of ${this.name}`}
      >`;
  }

  render() {
    return html`
      <wa-card>
        <div class="card-body">
          ${this.renderIcon()}
          <div class="text">
            ${this.unfinished ? html`<wa-badge pill variant="warning">Unfinished</wa-badge>` : undefined}
            <h2>${this.name}</h2>
            <p>${this.objective}</p>
          </div>
        </div>

        <footer slot="footer">
          <wa-button 
              id="play" 
              href="${this.href}" 
              aria-label=${`Play ${this.name}`} 
              variant="brand"
          >${this.resume ? "Resume" : "Play"}</wa-button>
        </footer>
      </wa-card>
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
        wa-card {
          transition: 
            transform var(--wa-transition-normal) var(--wa-transition-easing),
            box-shadow var(--wa-transition-normal) var(--wa-transition-easing);
        }

        wa-card:hover {
          transform: translateY(calc(-1 * var(--wa-space-2xs)));
          box-shadow: var(--wa-shadow-l);
        }
      }
    }

    wa-card {
      height: 100%;
      width: 100%;
      position: relative;
      --padding: var(--wa-space-m);

      cursor: pointer;
    }

    wa-card::part(base) {
      height: 100%;
    }

    wa-card::part(body) {
      flex-grow: 1;
    }

    wa-card::part(footer) {
      /* Remove the separator line */
      border-block-start: none;
      padding-block-start: 0;
    }

    .card-body {
      display: flex;
      flex-direction: row;
      gap: var(--wa-space-m);
    }

    .icon {
      display: block;
      width: var(--icon-size);
      height: var(--icon-size);
      border-radius: var(--wa-border-radius-s);
    }

    .icon.unfinished {
      text-align: center;
      line-height: var(--icon-size);
      font-size: calc(0.8 * var(--icon-size));
    }

    wa-badge {
      /* WEB-56239: */ /*noinspection CssInvalidPropertyValue*/ 
      float: inline-end;
      margin-inline-start: var(--wa-space-2xs);
      margin-block-end: var(--wa-space-2xs);
    }

    h2 {
      margin: 0;
      line-height: 1;
      color: var(--wa-color-text-normal);
      font-size: var(--wa-font-size-l);
      font-weight: var(--wa-font-weight-semibold);
    }

    p {
      margin: var(--wa-space-s) 0 0 0;
      color: var(--wa-color-text-quiet);
      font-size: var(--wa-font-size-m);
      font-weight: var(--wa-font-weight-normal);
      line-height: var(--wa-line-height-normal);
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
