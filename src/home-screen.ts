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
import "./catalog-list.ts";
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

      ${settings.showIntro ? this.renderIntro() : nothing}
      
      <catalog-list></catalog-list>
      
      <slot name="after"></slot>

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
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "home-screen": HomeScreen;
  }
}
