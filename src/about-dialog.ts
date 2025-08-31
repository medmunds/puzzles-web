import { css, type HTMLTemplateResult, html, LitElement, nothing } from "lit";
import { query } from "lit/decorators/query.js";
import { customElement } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { licenses as thirdPartyLicenses } from "./assets/third-party-licenses.json";
import { version } from "./catalog.ts";

// Missing third-party-licenses.json? Try `npm run generate-licenses-json`.

// Register components
import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/details/details.js";
import "@awesome.me/webawesome/dist/components/dialog/dialog.js";
import "@awesome.me/webawesome/dist/components/divider/divider.js";
import "@awesome.me/webawesome/dist/components/icon/icon.js";

// Raw content
import licenseText from "../LICENSE?raw";
import sgtPuzzlesLicenseText from "../puzzles/LICENCE?raw";
import privacyHtml from "./assets/privacy.html?raw";

// The name of this repo's project (which is covered by its LICENSE)
const repoName = "Puzzles web app";
// The (potentially branded) name of the PWA built from this repo
const appName = import.meta.env.VITE_APP_NAME || repoName;

// Override some specific package names
const packageDisplayNames: Record<string, string> = {
  "@awesome.me/webawesome": "Web Awesome",
  "@lit-labs/observers": "Lit Labs Observers",
  "@lit-labs/signals": "Lit Labs Signals",
  "@lit/context": "Lit Context",
  "@sentry/browser": "Sentry SDK (Browser)",
  "@sentry/wasm": "Sentry SDK (WASM)",
  "colorjs.io": "Color.js",
  "lucide-static": "Lucide Icons",
} as const;

const packageDisplayName = (packageName: string): string => {
  let displayName = packageDisplayNames[packageName];
  if (displayName === undefined) {
    // Default: convert to Title case (package names are ASCII, not arbitrary Unicode)
    displayName = packageName.slice(0, 1).toUpperCase() + packageName.slice(1);
  }
  return displayName;
};

/**
 * Split text into paragraphs at double linebreaks.
 * Optional label is inserted at the start of the first paragraph if provided.
 */
const licenseTextToHTML = (
  text: string,
  label?: string | HTMLTemplateResult,
): HTMLTemplateResult[] =>
  text
    .split("\n\n")
    .map((paragraph, i) => html`<p>${i === 0 ? label : nothing}${paragraph}</p>`);

@customElement("about-dialog")
export class AboutDialog extends LitElement {
  @query("wa-dialog", true)
  protected dialog?: HTMLElementTagNameMap["wa-dialog"];

  get open(): boolean {
    return this.dialog?.open ?? false;
  }
  set open(value: boolean) {
    if (this.dialog) {
      this.dialog.open = value;
    }
  }

  // TODO: emcc runtime licenses (hardcode?)
  private static thirdPartyLicenses = thirdPartyLicenses
    .map(({ name, licenseType, licenseText }) => ({
      name: packageDisplayName(name),
      text: licenseText ?? `${licenseType} License (no license text available)`,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  protected override render() {
    return html`
      <wa-dialog light-dismiss>
        <div slot="label">About <cite>${appName}</cite></div>
        
        <div class="panel">
          <p>
            <cite>${appName}</cite>
            version <span class="version">${version}</span>
          </p>
          <p>
            A web adaptation of 
            <cite>${this.renderOffsiteLink(
              "https://www.chiark.greenend.org.uk/~sgtatham/puzzles/",
              "Simon Tatham’s Portable Puzzles Collection",
            )}</cite>
            by Mike Edmunds
          </p>
          <p>
            Source code: 
            ${this.renderOffsiteLink("https://github.com/medmunds/puzzles")}
          </p>
        </div>
        
        <wa-details summary="Privacy" name="section">
          ${unsafeHTML(privacyHtml)}
        </wa-details>

        <wa-details summary="Copyright notices and licenses" name="section">
          ${licenseTextToHTML(
            licenseText,
            html`<strong>${repoName /* NOT appName */}</strong><br>`,
          )}

          <wa-divider></wa-divider>
          
          <div>
            <h2>Additional licensed software</h2>
            <p>This application incorporates the following software<br>
              (expand each item to view its copyright and license terms)</p>
          </div>
          
          <wa-details appearance="plain" icon-position="start" name="license">
            <div slot="summary">Simon Tatham’s Portable Puzzles Collection</div>
            ${licenseTextToHTML(sgtPuzzlesLicenseText)}
          </wa-details>

          ${AboutDialog.thirdPartyLicenses.map(
            ({ name, text }) => html`
              <wa-details appearance="plain" icon-position="start" name="license">
                <div slot="summary">${name}</div>
                ${licenseTextToHTML(text)}
              </wa-details>
            `,
          )}

        </wa-details>
      </wa-dialog>
    `;
  }

  private renderOffsiteLink(link: string, text?: string) {
    // The html is meant to prevent wrapping the offsite-link icon
    // separately from the trailing word in the text.
    const words = (text ?? link).split(" ");
    const lastWord = words.pop();
    return html`
      <a href=${link} target="_blank">${words.join(" ")}
        <span class="nowrap">${lastWord}<wa-icon 
          name="offsite-link" label="Opens in new tab"></wa-icon></span></a>
    `;
  }

  static styles = css`
    :host {
      display: contents;
    }

    wa-dialog {
      --width: min(calc(100vw - 2 * var(--wa-space-l)), 35rem);
    }

    wa-dialog::part(body) {
      display: flex;
      flex-direction: column;
      gap: var(--wa-space-l);
    }

    wa-dialog::part(dialog) {
      background-color: var(--wa-color-neutral-95);
    }

    wa-details:not([appearance="plain"])[open]::part(header) {
      border-block-end:
          var(--wa-panel-border-width)
          var(--wa-color-surface-border)
          var(--wa-panel-border-style);
    }
    
    wa-details wa-details {
      &::part(header) {
        padding: 0;
        font-weight: var(--wa-font-weight-heading);
      }
      &::part(content) {
        padding-block: 0;
        padding-inline-start: calc(1em + var(--spacing));
        padding-inline-end: 0;
      }
    }
    
    .panel {
      /* Effectively a wa-details without the summary */
      padding: var(--wa-space-m);

      background-color: var(--wa-color-surface-default);
      color: var(--wa-color-text-normal);

      border: var(--wa-panel-border-width) var(--wa-color-surface-border) var(--wa-panel-border-style);
      border-radius: var(--wa-panel-border-radius);
    }

    .panel,
    wa-details::part(content) {
      display: flex;
      flex-direction: column;
      gap: var(--wa-space-m);
    }

    p, ul, h2 {
      margin: 0;
    }
    
    h2 {
      font-family: var(--wa-font-family-heading);
      font-size: var(--wa-font-size-m);
      font-weight: var(--wa-font-weight-heading);
    }
    
    a {
      color: var(--wa-color-text-link);
      text-decoration: var(--wa-link-decoration-default);

      @media (hover: hover) {
        &:hover {
          text-decoration: var(--wa-link-decoration-hover);
        }
      }
    }
    
    .nowrap {
      white-space: nowrap;
    }
    
    wa-icon[name="offsite-link"] {
      margin-inline-start: 0.1em;
      vertical-align: -2px; /* visual baseline alignment*/
    }
    
    .version {
      user-select: all;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "about-dialog": AboutDialog;
  }
}
