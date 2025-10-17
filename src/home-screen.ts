import { SignalWatcher } from "@lit-labs/signals";
import { css, html, nothing, unsafeCSS } from "lit";
import { customElement } from "lit/decorators.js";
import rawHomeScreenCSS from "./css/home-screen.css?inline";
import { canonicalBaseUrl } from "./routing.ts";
import { Screen } from "./screen.ts";
import { cssNative, cssWATweaks } from "./utils/css.ts";
import { ScrollAnimationController } from "./utils/scroll-animation-controller.ts";

// Register components
import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/icon/icon.js";
import "./catalog-list.ts";
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

      <header part="header">
        <img class="logo" src="/favicon.svg" role="presentation">
        <h1 class="title">Puzzles</h1>
        <div class="subtitle">from Simon&nbsp;Tatham’s
          portable&nbsp;puzzle&nbsp;collection</div>
        <wa-button class="help-button" href="help/" appearance="filled" variant="brand">
          <wa-icon name="help" slot="start"></wa-icon>
          Help
        </wa-button>
      </header>

      <slot name="before"></slot>
      
      <catalog-list></catalog-list>
      
      <slot name="after"></slot>

      <footer slot="footer">
        <div>Credits, privacy info, copyright notices and licenses are in the
          <a href="#about">about box</a>.</div>
        <div><a href="#settings">Settings</a></div> <!-- TODO: remove this -->
      </footer>

      <dynamic-content></dynamic-content>
    `;
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
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "home-screen": HomeScreen;
  }
}
