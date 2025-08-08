import type WaDialog from "@awesome.me/webawesome/dist/components/dialog/dialog.js";
import { consume } from "@lit/context";
import { SignalWatcher } from "@lit-labs/signals";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { puzzleContext } from "./puzzle/contexts.ts";
import type { Puzzle } from "./puzzle/puzzle.ts";
import type { PuzzleConfigChangeEvent } from "./puzzle/puzzle-config.ts";
import { settings } from "./store/settings.ts";
import { audioClick } from "./utils/audio.ts";
import { autoBind } from "./utils/autobind.ts";

// Register components
import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/checkbox/checkbox.js";
import "@awesome.me/webawesome/dist/components/details/details.js";
import "@awesome.me/webawesome/dist/components/dialog/dialog.js";
import "@awesome.me/webawesome/dist/components/icon/icon.js";
import "@awesome.me/webawesome/dist/components/slider/slider.js";

@customElement("settings-dialog")
export class SettingsDialog extends SignalWatcher(LitElement) {
  @consume({ context: puzzleContext, subscribe: true })
  @state()
  private puzzle?: Puzzle;

  @property({ type: String, attribute: "puzzle-name" })
  puzzleName = "";

  @query("wa-dialog", true)
  private dialog?: WaDialog;

  protected override render() {
    return html`
      <wa-dialog label="Preferences" light-dismiss>
        ${this.renderPuzzleSection()}
        ${this.renderAppearanceSection()}
        ${this.renderMouseButtonsSection()}
        ${this.renderAdvancedSection()}
      </wa-dialog>
    `;
  }

  private renderPuzzleSection() {
    if (!this.puzzle) {
      // Preferences from catalog-screen: skip puzzle specific section.
      return nothing;
    }

    // Puzzle.displayName is sometimes wrong (e.g., "Train Tracks" for "Tracks").
    // Allow override from catalog data via property.
    const puzzleName = this.puzzleName || this.puzzle.displayName;

    // Use autosubmit on the puzzle-preferences-form to apply changes immediately.
    // (settings-dialog does not use OK/Cancel flow.)
    return html`
      <wa-details open>
        <div slot="summary">Options for <cite>${puzzleName}</cite></div>
        <puzzle-preferences-form 
            autosubmit
            @puzzle-preferences-change=${this.handlePuzzlePreferencesChange}
          ></puzzle-preferences-form>
      </wa-details>
    `;
  }

  private renderAppearanceSection() {
    return html`
      <wa-details summary="Appearance">
        <wa-checkbox
            checked
            hint="Victory message with “New game” button"
          >Show popup when solved</wa-checkbox>
        <wa-checkbox 
            checked
            hint="On-screen buttons for puzzles that need keyboard input"
          >Show virtual keyboard</wa-checkbox>
        <wa-checkbox 
            checked
            hint="Text below some puzzles (you might need it to solve them)"
          >Show status bar</wa-checkbox>
        <wa-checkbox
            hint="Make the puzzle as large as possible"
            ?checked=${settings.maximizePuzzleSize !== 0}
            @change=${(event: Event) => {
              // (Special case for non-standard handling; no data-setting attr.)
              const checked = (event.target as HTMLInputElement).checked;
              settings.maximizePuzzleSize = checked ? 999 : 0;
            }}
          >Stretch puzzle to fit</wa-checkbox>
      </wa-details>
    `;
  }

  private renderMouseButtonsSection() {
    // The wa-sliders use .value prop rather than value attr binding
    // to work around a bug where changes to the value attr aren't rendered.
    // https://github.com/shoelace-style/webawesome/issues/1273
    return html`
      <wa-details summary="Mouse buttons">
        <div class="help">
          Options for emulating the right mouse button on touch devices
        </div>
        <wa-checkbox
            hint="Swaps left and right mouse buttons (allows tap for right click)"
          >Show <wa-icon name="mouse-left-button" label="left button"></wa-icon>
            ⁄ <wa-icon name="mouse-right-button" label="right button"></wa-icon>
            toggle</wa-checkbox>
        <wa-checkbox 
            hint="For right drag, long hold then move finger"
            ?checked=${autoBind(settings, "rightButtonLongPress")}
          >Long press for right click</wa-checkbox>
        <wa-checkbox 
            hint="For right drag, lift second finger then move first finger"
            ?checked=${autoBind(settings, "rightButtonTwoFingerTap")}
          >Two finger tap for right click</wa-checkbox>
        <wa-slider
            label="Audio feedback volume"
            .value=${autoBind(settings, "rightButtonAudioVolume")}
            min="0"
            max="100"
            step="5"
            hint="Click sound on long press or two finger tap"
            with-tooltip
            .valueFormatter=${(value: number) => (value > 0 ? value : "Off")}
            @click=${async (event: Event) => {
              // Audition click sound
              const slider: HTMLInputElement = event.target as HTMLInputElement;
              const volume = Number.parseInt(slider.value);
              if (volume > 0) {
                await audioClick({ volume });
              }
            }}
        >
          <span slot="reference">Off</span>
          <span slot="reference">Max</span>
        </wa-slider>
        <wa-slider
            label="Detection time"
            .value=${autoBind(settings, "rightButtonHoldTime")}
            min="100"
            max="1000"
            step="25"
            hint="Long press length/​maximum delay for two finger tap"
            with-tooltip
            .valueFormatter=${(value: number) => `${value} ms`}
        >
          <span slot="reference">100 ms</span>
          <span slot="reference">1 s</span>
        </wa-slider>
      </wa-details>
    `;
  }

  private renderAdvancedSection() {
    return html`
      <wa-details summary="Advanced">
        <div><wa-button>Clear data</wa-button></div>
        <wa-checkbox
            hint="Experimental puzzles in development (may have lots of bugs!)"
          >Show unfinished puzzles</wa-checkbox>
      </wa-details>
    `;
  }

  private async handlePuzzlePreferencesChange(event: PuzzleConfigChangeEvent) {
    if (this.puzzle) {
      // Persist only the changed preferences to the DB
      await settings.setPuzzlePreferences(this.puzzle.puzzleId, event.detail.changes);
    }
  }

  get open() {
    return this.dialog?.open ?? false;
  }
  set open(isOpen: boolean) {
    if (this.dialog) {
      this.dialog.open = isOpen;
    }
  }

  async show() {
    if (!this.dialog?.open) {
      // Make sure puzzle-preferences-form is displaying current values
      await this.shadowRoot?.querySelector("puzzle-preferences-form")?.reloadValues();
    }
    if (this.dialog) {
      this.dialog.open = true;
    }
  }

  hide() {
    if (this.dialog) {
      this.dialog.open = false;
    }
  }

  static styles = css`
    :host {
      display: contents;
    }

    wa-dialog::part(body) {
      display: flex;
      flex-direction: column;
      gap: var(--wa-space-l);
    }
    
    wa-dialog::part(dialog) {
      background-color: var(--wa-color-neutral-95);
    }
    
    wa-details[open]::part(header) {
      border-block-end: 
          var(--wa-panel-border-width) 
          var(--wa-color-surface-border) 
          var(--wa-panel-border-style);
    }
    
    wa-details::part(content) {
      display: flex;
      flex-direction: column;
      gap: var(--wa-space-l);
    }
    
    .help {
      /* match hint in various controls */
      color: var(--wa-form-control-hint-color);
      font-size: var(--wa-font-size-smaller);
      font-weight: var(--wa-form-control-hint-font-weight);
      line-height: var(--wa-form-control-hint-line-height);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "settings-dialog": SettingsDialog;
  }
}
