import { css, type HTMLTemplateResult, html, LitElement, nothing } from "lit";
import { query } from "lit/decorators/query.js";
import { customElement, state } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { version } from "./catalog.ts";
import { pwaManager } from "./utils/pwa.ts";

// Register components
import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/details/details.js";
import "@awesome.me/webawesome/dist/components/dialog/dialog.js";
import "@awesome.me/webawesome/dist/components/divider/divider.js";
import "@awesome.me/webawesome/dist/components/icon/icon.js";
import "@awesome.me/webawesome/dist/components/spinner/spinner.js";

// Raw content
import licenseText from "../LICENSE?raw";
import sgtPuzzlesLicenseText from "../puzzles/LICENCE?raw";
import privacyHtml from "./assets/privacy.html?raw";

// The name of this repo's project (which is covered by its LICENSE)
const repoName = "Puzzles web app";
// The (potentially branded) name of the PWA built from this repo
const appName = import.meta.env.VITE_APP_NAME || repoName;

// Form of dependencies.json
interface DependencyInfo {
  dependencies: {
    name: string;
    version?: string;
    license: string | null;
    notice: string | null;
  }[];
}

/**
 * Format text as html:
 * - Split into <p> at double NLs (but ignore single NL as plain text wrapping)
 * - Convert CR to <br> (special convention for dependencies.json from puzzles)
 * - Omit ----- or ===== (and longer sequences)
 * Optional label is inserted at the start of the first paragraph if provided.
 */
function licenseTextToHTML(
  text: string,
  label?: string | HTMLTemplateResult,
): HTMLTemplateResult[] {
  const result: HTMLTemplateResult[] = [];
  const divider = /^\s*(?:={5,}|-{5,})\s*$/;
  let firstParagraph = true;
  for (const paragraph of text.trim().split("\n\n")) {
    if (divider.test(paragraph)) {
      // (It seems more readable to just omit the <hr>.)
      // result.push(html`<wa-divider></wa-divider>`);
      continue;
    }
    const lines = paragraph
      .replace(/[-=]{5,}/g, "")
      .split("\r")
      .map((line, i) => (i > 0 ? html`<br>${line}` : line));
    result.push(html`<p>${firstParagraph ? label : nothing}${lines}</p>`);
    firstParagraph = false;
  }

  return result;
}

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

  @state()
  private updateAvailable: boolean | null = null; // null means check in progress

  @state()
  private dependencies?: DependencyInfo["dependencies"];

  private async loadDependencies() {
    if (!this.dependencies) {
      // Load dependency info. This must be fetched rather than imported,
      // because dependencies-app.json is generated *after* bundling
      // (and we don't want to bundle an imported placeholder).
      async function loadJson(href: string): Promise<DependencyInfo["dependencies"]> {
        const response = await fetch(href);
        const { dependencies } = (await response.json()) as DependencyInfo;
        return dependencies;
      }

      const dependencies = (
        await Promise.all([
          // package.json dependencies, from rollup-plugin-license via vite:
          loadJson(`${import.meta.env.BASE_URL}dependencies-app.json`),
          // Emscripten/WASM dependencies, from puzzles/emcc-dependency-info.py:
          loadJson(new URL("./assets/puzzles/dependencies.json", import.meta.url).href),
        ])
      ).flat();

      // Sort by name ignoring leading "@" (and other punctuation)
      const { compare } = new Intl.Collator(undefined, {
        sensitivity: "accent",
        ignorePunctuation: true,
      });
      dependencies.sort((a, b) => compare(a.name, b.name));
      this.dependencies = dependencies;
    }
  }

  protected override render() {
    return html`
      <wa-dialog light-dismiss @wa-show=${this.handleDialogShow}>
        <div slot="label">About <cite>${appName}</cite></div>
        
        <div class="panel">
          <p>
            A web adaptation of
            <cite>${this.renderOffsiteLink(
              "https://www.chiark.greenend.org.uk/~sgtatham/puzzles/",
              "Simon Tatham’s Portable Puzzles Collection",
            )}</cite>
            by Mike Edmunds
          </p>
          <p>
            Version <span class="version">${version}</span><br>
            ${this.renderUpdateInfo()}
          </p>
          <p>
            Source code: 
            ${this.renderOffsiteLink("https://github.com/medmunds/puzzles")}
          </p>
        </div>
        
        <wa-details summary="Privacy">
          ${unsafeHTML(privacyHtml)}
        </wa-details>

        <wa-details 
            summary="Copyright notices and licenses" 
            @wa-show=${this.loadDependencies}
        >
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
          
          <wa-details appearance="plain" icon-placement="start">
            <div slot="summary">Simon Tatham’s Portable Puzzles Collection</div>
            ${licenseTextToHTML(sgtPuzzlesLicenseText)}
          </wa-details>

          ${this.dependencies?.map(
            ({ name, license, notice }) => html`
              <wa-details appearance="plain" icon-placement="start">
                <div slot="summary">${name}</div>
                ${licenseTextToHTML(notice ?? `${license} license (no license text provided)`)}
              </wa-details>
            `,
          )}

        </wa-details>
      </wa-dialog>
    `;
  }

  private renderOffsiteLink(link: string, text?: string) {
    return html`<a href=${link} target="_blank">${text ?? link}</a>`;
  }

  private renderUpdateInfo() {
    if (this.updateAvailable === null) {
      return html`<wa-spinner></wa-spinner> Checking for update&hellip;`;
    }

    if (this.updateAvailable) {
      return html`
        Update available: 
        <a href="#" @click=${this.installUpdate}>install now</a>
      `;
    }

    return html`
      Up to date 
      (<a href="#" @click=${this.checkForUpdate}>check again</a>)
    `;
  }

  private async handleDialogShow(event: Event) {
    // Check for updates when the dialog is shown.
    // (The wa-details elements also emit wa-show, and we don't want to check
    // for updates when those are expanded.)
    if (event.target instanceof HTMLElement && event.target.localName === "wa-dialog") {
      await this.checkForUpdate();
    }
  }

  private async checkForUpdate() {
    this.updateAvailable = null;
    this.updateAvailable = await pwaManager.checkForUpdate();
  }

  private async installUpdate() {
    await pwaManager.installUpdate();
    this.updateAvailable = false;
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
        /* caret (wa-icon) width = 1.25em */
        padding-inline-start: calc(1.25em + var(--spacing));
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

    p, ul, h1, h2 {
      margin: 0;
    }
    
    h1, h2 {
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
    
    wa-spinner {
      vertical-align: -2px; /* visual text-middle alignment*/
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
