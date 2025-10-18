import { SignalWatcher } from "@lit-labs/signals";
import { css, html, nothing, unsafeCSS } from "lit";
import { customElement } from "lit/decorators.js";
import rawHomeScreenCSS from "./css/home-screen.css?inline";
import { canonicalBaseUrl } from "./routing.ts";
import { Screen } from "./screen.ts";
import { settings } from "./store/settings.ts";
import { cssNative, cssWATweaks } from "./utils/css.ts";
import { ScrollAnimationController } from "./utils/scroll-animation-controller.ts";

// Register components
import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/divider/divider.js";
import "@awesome.me/webawesome/dist/components/dropdown/dropdown.js";
import "@awesome.me/webawesome/dist/components/dropdown-item/dropdown-item.js";
import "@awesome.me/webawesome/dist/components/icon/icon.js";
import "@awesome.me/webawesome/dist/components/tooltip/tooltip.js";
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

      <header part="header">${
        this.size === "large" ? this.renderWideHeader() : this.renderCompactHeader()
      }</header>

      ${settings.showIntro ? this.renderIntro() : nothing}
      
      <catalog-list></catalog-list>
      
      <slot name="after"></slot>

      <footer slot="footer">
        <div>Credits, privacy info, copyright notices and licenses are in the
          <a href="#about">about box</a>.</div>
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
        portable&nbsp;puzzle&nbsp;collection</div>

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
        portable&nbsp;puzzle&nbsp;collection</div>

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
      <wa-dropdown-item data-command="#settings" value="new">
        <wa-icon slot="icon" name="settings"></wa-icon>
        Preferences
      </wa-dropdown-item>
      <wa-divider></wa-divider>
      <wa-dropdown-item data-command="#about">
        <wa-icon slot="icon" name="info"></wa-icon>
        About
      </wa-dropdown-item>
    `;
  }

  private renderIntro() {
    return html`
      <div part="intro">
        <wa-button 
            id="dismiss-intro" 
            appearance="outlined" 
            size="small"
            @click=${this.dismissIntro}
        >
          <wa-icon library="system" name="xmark" variant="solid" label="Hide intro"></wa-icon>
        </wa-button>
        <wa-tooltip for="dismiss-intro">Hide intro</wa-tooltip>
        <slot name="intro"></slot>
      </div>
    `;
  }

  private dismissIntro() {
    settings.showIntro = false;
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
      
      [part="intro"] {
        display: block;
        max-width: 55ch;

        &::slotted(section) {
          display: contents;
        }
        
        wa-button {
          float: inline-end;
          margin-block-start: var(--app-padding);
          margin-block-end: var(--wa-space-s);
          margin-inline-start: var(--wa-space-s);
          margin-inline-end: var(--app-padding);
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
