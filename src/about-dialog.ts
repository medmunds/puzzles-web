import {
  css,
  type HTMLTemplateResult,
  html,
  LitElement,
  nothing,
  type TemplateResult,
} from "lit";
import { query } from "lit/decorators/query.js";
import { customElement, state } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { version as puzzlesVersion } from "./puzzle/catalog.ts";
import { cssNative, cssWATweaks } from "./utils/css.ts";

// Register components
import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/details/details.js";
import "@awesome.me/webawesome/dist/components/dialog/dialog.js";
import "@awesome.me/webawesome/dist/components/divider/divider.js";
import "@awesome.me/webawesome/dist/components/icon/icon.js";
import "./command-link"; // may appear in embedded text (e.g., privacy.html)

// Raw content
import appLicenseText from "../LICENSE?raw";
import puzzlesLicenseText from "../puzzles/LICENCE?raw";
import unreleasedLicenseText from "../puzzles/unreleased/LICENCE?raw";
import privacyHtml from "./assets/privacy.html?raw";

// The name of this repo's project (which is covered by its LICENSE)
const repoName = "Puzzles web app";
// The (potentially branded) name of the PWA built from this repo
const appName = import.meta.env.VITE_APP_NAME || repoName;
const appVersion = import.meta.env.VITE_APP_VERSION || "(development build)";

const sgtPuzzlesLink = "https://www.chiark.greenend.org.uk/~sgtatham/puzzles/";
const unreleasedPuzzlesLink = "https://github.com/x-sheep/puzzles-unreleased";
const androidAppLink =
  "https://play.google.com/store/apps/details?id=name.boyle.chris.sgtpuzzles";
const iOSAppLink = "https://apps.apple.com/in/app/puzzles-reloaded/id6504365885";
// const iOSOldAppLink = "https://apps.apple.com/us/app/simon-tathams-puzzles/id622220631";

const repoLink = "https://github.com/medmunds/puzzles-web";
const forumLink = "https://github.com/medmunds/puzzles-web/discussions";
const issuesLink = "https://github.com/medmunds/puzzles-web/issues";

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
  const divider = /^\s*(?:={3,}|-{3,})\s*$/;
  let firstParagraph = true;
  let lastParagraphWasDivider = false;
  for (const paragraph of text.trim().split("\n\n")) {
    if (divider.test(paragraph)) {
      if (!firstParagraph) {
        result.push(html`<wa-divider></wa-divider>`);
        lastParagraphWasDivider = true;
      }
      continue;
    }
    lastParagraphWasDivider = false;
    const lines = paragraph
      .replace(/[-=]{5,}/g, "")
      .split("\r")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) =>
        // Linkify the Apache license url. (Could try to implement general
        // linkfication, but this is simpler and all we really need for now.)
        line === "http://www.apache.org/licenses/LICENSE-2.0"
          ? html`<a href="https://www.apache.org/licenses/LICENSE-2.0" target="_blank">${line}</a>`
          : line,
      )
      .map((line, i) => (i > 0 ? html`<br>${line}` : line));
    if (lines.length > 0) {
      result.push(html`<p>${firstParagraph ? label : nothing}${lines}</p>`);
      firstParagraph = false;
    }
  }
  if (lastParagraphWasDivider) {
    // Skip trailing <hr>
    result.pop();
  }
  if (firstParagraph && label) {
    // Didn't get a chance to add the label (no paragraphs in the lines)
    result.push(html`<p>${label}</p>`);
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

  async showPanel(panelId: string) {
    const panel = this.shadowRoot?.querySelector<HTMLElementTagNameMap["wa-details"]>(
      `wa-details#${panelId}`,
    );
    if (panel) {
      panel.open = true;
      await panel.updateComplete;
      panel.scrollIntoView({});
    }
  }

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
      <wa-dialog light-dismiss>
        <div slot="label">About ${appName}</div>
        
        <div class="panel">
          <p>
            A web adaptation of
            <cite>Simon&nbsp;Tatham’s Portable&nbsp;Puzzle&nbsp;Collection</cite>
            and Lennard&nbsp;Sprong’s <cite>puzzles-unreleased</cite> additions,
            by&nbsp;Mike&nbsp;Edmunds
          </p>
          <p>
            Version <span class="version">${appVersion}</span><br>
            Compatible with Portable Puzzle Collection 
            version&nbsp;<span class="version">${puzzlesVersion}</span>
          </p>
          <p>
            This is open source software. Source code and more on GitHub:
            ${this.renderOffsiteLink(repoLink, repoLink.replace("https://", ""))}
            - ${this.renderOffsiteLink(forumLink, html`discussion&nbsp;forums`)}
            - ${this.renderOffsiteLink(issuesLink, html`bug&nbsp;reports`)}
          </p>
        </div>
        
        <wa-details id="credits" name="panel" summary="Credits" open>
          <p>Special thanks to&hellip;</p>
          <ul role="list">
            <li>Simon Tatham and all the contributors to the official
              ${this.renderOffsiteLink(sgtPuzzlesLink, "Portable Puzzle Collection")}, 
              for over 20 years of fascinating puzzle solving</li>
            <li>Lennard Sprong for the
              ${this.renderOffsiteLink(unreleasedPuzzlesLink, "puzzles-unreleased")} 
              additions (which actually <em>have</em> been released, at least twice now)</li>
            <li>Chris Boyle, Greg Hewgill and Kyle Swarner for their fantastic
              ${this.renderOffsiteLink(androidAppLink, "Android")} and
              ${this.renderOffsiteLink(iOSAppLink, "iOS")} apps, 
              from which I’ve freely borrowed several clever ideas</li>
            <li>${this.renderOffsiteLink("https://lucide.dev/", "Lucide")} icons
              and ${this.renderOffsiteLink("https://webawesome.com", "Web Awesome")}
              UI components</li>
            <li>All the other open source software that makes this app possible
              (see the source code link above and the licenses section below)</li>
          </ul>
        </wa-details>
        
        <wa-details id="privacy" name="panel" summary="Privacy">
          ${unsafeHTML(privacyHtml)}
        </wa-details>

        <wa-details
            id="license" name="panel"
            summary="Copyright notices and licenses" 
            @wa-show=${this.loadDependencies}
        >
          <p>This software is released under the MIT License:</p>
          ${licenseTextToHTML(
            appLicenseText,
            html`<strong>${repoName /* NOT appName */}</strong><br>`,
          )}

          <wa-divider></wa-divider>
          
          <div>
            <h2>Additional licensed software</h2>
            <p>This software includes portions of the following
              (expand each item for copyright and license terms):</p>
          </div>
          
          <wa-details appearance="plain" icon-placement="start">
            <div slot="summary">Simon Tatham’s Portable Puzzle Collection</div>
            ${licenseTextToHTML(puzzlesLicenseText)}
          </wa-details>
          <wa-details appearance="plain" icon-placement="start">
            <div slot="summary">x-sheep/puzzles-unreleased</div>
            ${licenseTextToHTML(unreleasedLicenseText)}
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

  private renderOffsiteLink(link: string, text?: string | TemplateResult) {
    return html`<a href=${link} target="_blank">${text ?? link}</a>`;
  }

  static styles = [
    cssNative,
    cssWATweaks,
    css`
      :host {
        display: contents;
      }
  
      wa-dialog {
        --width: min(calc(100vw - 2 * var(--wa-space-l)), 65ch);
      }
  
      wa-dialog::part(body) {
        display: flex;
        flex-direction: column;
        gap: var(--wa-space-l);
      }
  
      wa-dialog::part(dialog) {
        background-color: var(--wa-color-brand-fill-quiet);
      }
  
      wa-details:not([appearance="plain"])[open]::part(header) {
        border-block-end:
            var(--wa-panel-border-width)
            var(--wa-color-surface-border)
            var(--wa-panel-border-style);
      }
      
      wa-details wa-details {
        margin-block-start: var(--wa-space-m);
        
        &::part(header) {
          padding: 0;
          font-weight: var(--wa-font-weight-semibold);
        }
        &::part(content) {
          padding-block: 0;
          /* caret (wa-icon) width = 1em in wa-tweaks.css */
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
  
      h1, h2, h3 {
        font-size: inherit;
      }
      
      ul {
        padding-inline-start: 1.25em;
      }
      
      strong {
        font-weight: var(--wa-font-weight-semibold);
      }
      
      .version {
        user-select: all;
      }
  `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "about-dialog": AboutDialog;
  }
}
