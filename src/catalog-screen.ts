import { LitElement, css, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { puzzles } from "./assets/catalog.json";
import type { PuzzleDataMap } from "./catalog.ts";

// Components
import "./catalog-card.ts";

@customElement("catalog-screen")
export class CatalogScreen extends LitElement {
  @state()
  private readonly puzzles: Readonly<PuzzleDataMap> = puzzles;

  render() {
    return html`
      <slot name="header"></slot>
      <div class="puzzle-grid">
        ${Object.entries(this.puzzles).map(
          ([puzzleId, puzzle]) => html`
          <catalog-card 
            .puzzleId=${puzzleId}
            .name=${puzzle.name}
            .description=${puzzle.description}
            .objective=${puzzle.objective}
            .unfinished=${puzzle.experimental}
          ></catalog-card>
        `,
        )}
      </div>
      <slot name="footer"></slot>
    `;
  }

  static styles = css`
    :host {
      display: block;
      width: 100%;
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
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "catalog-screen": CatalogScreen;
  }
}
