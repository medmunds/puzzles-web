import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { Screen } from "./screen.ts";
import { cssWATweaks } from "./utils/css.ts";
import { closest } from "./utils/dom.ts";

// Register components
import "@awesome.me/webawesome/dist/components/icon/icon.js";

/**
 * Custom component for referring to commands in text content.
 * Useful in help documents and other text that might appear within the app.
 *
 *   Open the <command-link command="share:link">share dialog</command-link>.
 *
 * If the command is available:
 * - renders as a button for correct interactivity and assistive purposes
 * - is styled like a link, but with a command-link icon to distinguish it
 * - exposes `data-command=${command}` for handling by Screen when clicked
 *
 * Otherwise displays as plain inline text.
 * (Similarly, if the component is not registered--as in a standalone help
 * document in the browser--it will appear as ordinary inline text.)
 */
@customElement("command-link")
export class CommandLink extends LitElement {
  @property({ type: String })
  command: string = "";

  @property({ type: Boolean, attribute: "hide-icon" })
  hideIcon = false;

  @state()
  private commandIsRegistered = false;

  override connectedCallback() {
    super.connectedCallback();
    // TODO: Screen should make command registry available as a context
    const commandRegistry = closest<Screen>(this, "home-screen,puzzle-screen");
    this.commandIsRegistered = commandRegistry?.hasCommand(this.command) ?? false;
  }

  protected override render() {
    // Be careful to avoid spaces around or between tags (they'll be visible)
    if (!this.commandIsRegistered) {
      return html`<slot></slot>`;
    }
    // (No label is needed for the icon: it's there to visually distinguish
    // this from a link. A screen reader will announce it as a button, so the
    // icon is "decorative" from its standpoint. In either case, the slotted
    // text content should identify the command.)
    const icon = this.hideIcon
      ? nothing
      : html`<wa-icon name="command-link"></wa-icon>`;
    return html`<button data-command=${this.command}>${icon}<slot></slot></span>`;
  }

  static styles = [
    cssWATweaks,
    css`
      :host {
        display: inline;
        --command-color: var(--wa-color-text-link);
      }
  
      button {
        /* Undo default button styling */
        all: unset;
        
        /* Style command as link-like (but different color) */
        color: var(--command-color);
        text-decoration: var(--wa-link-decoration-default);
        -webkit-text-decoration: var(--wa-link-decoration-default); /* Safari */
        text-decoration-thickness: 0.09375em;
        text-underline-offset: 0.125em;
        cursor: pointer;
  
        @media (hover: hover) {
          &:hover {
            color: color-mix(in oklab, var(--command-color), var(--wa-color-mix-hover));
            text-decoration: var(--wa-link-decoration-hover);
            -webkit-text-decoration: var(--wa-link-decoration-hover); /* Safari */
          }
        }
      }
  
      wa-icon {
        margin-inline-end: 0.1em;
        vertical-align: -2px; /* visual baseline alignment*/
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "command-link": CommandLink;
  }
}
