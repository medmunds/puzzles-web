import { SignalWatcher } from "@lit-labs/signals";
import { consume } from "@lit/context";
import type SlDialog from "@shoelace-style/shoelace/dist/components/dialog/dialog.js";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { puzzleContext } from "./puzzle/contexts.ts";
import type { PuzzleConfigChangeEvent } from "./puzzle/puzzle-config.ts";
import type { Puzzle } from "./puzzle/puzzle.ts";
import { settings } from "./store/settings.ts";
import { assertHasWritableProperty } from "./utils/types.ts";

// Register components
import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/checkbox/checkbox.js";
import "@shoelace-style/shoelace/dist/components/details/details.js";
import "@shoelace-style/shoelace/dist/components/dialog/dialog.js";
import "@shoelace-style/shoelace/dist/components/icon/icon.js";
import "@shoelace-style/shoelace/dist/components/range/range.js";

@customElement("settings-dialog")
export class SettingsDialog extends SignalWatcher(LitElement) {
  @consume({ context: puzzleContext, subscribe: true })
  @state()
  private puzzle?: Puzzle;

  @property({ type: String, attribute: "puzzle-name" })
  puzzleName = "";

  @query("sl-dialog", true)
  private dialog?: SlDialog;

  protected override render() {
    return html`
      <sl-dialog label="Preferences" @sl-change=${this.handleSettingsChange}>
        ${this.renderPuzzleSection()}
        ${this.renderAppearanceSection()}
        ${this.renderMouseButtonsSection()}
        ${this.renderAdvancedSection()}
      </sl-dialog>
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
      <sl-details open>
        <div slot="summary">Options for <cite>${puzzleName}</cite></div>
        <puzzle-preferences-form 
            autosubmit
            @puzzle-preferences-change=${this.handlePuzzlePreferencesChange}
          ></puzzle-preferences-form>
      </sl-details>
    `;
  }

  private renderAppearanceSection() {
    return html`
      <sl-details summary="Appearance">
        <sl-checkbox
            checked
            help-text="Victory message with “New game” button"
          >Show popup when solved</sl-checkbox>
        <sl-checkbox 
            checked
            help-text="On-screen buttons for puzzles that need keyboard input"
          >Show virtual keyboard</sl-checkbox>
        <sl-checkbox 
            checked
            help-text="Text below some puzzles (you might need it to solve them)"
          >Show status bar</sl-checkbox>
        <sl-checkbox
            help-text="Make the puzzle as large as possible"
            ?checked=${settings.maximizePuzzleSize !== 0}
            @sl-change=${(event: Event) => {
              // (Special case for non-standard handling; no data-setting attr.)
              const checked = (event.target as HTMLInputElement).checked;
              settings.maximizePuzzleSize = checked ? 999 : 0;
            }}
          >Stretch puzzle to fit</sl-checkbox>
      </sl-details>
    `;
  }

  private renderMouseButtonsSection() {
    return html`
      <sl-details summary="Mouse buttons">
        <div class="help">
          Options for emulating the right mouse button on touch devices
        </div>
        <sl-checkbox
            help-text="Swaps left and right mouse buttons (allows tap for right click)"
          >Show <sl-icon name="mouse-left-button" label="left button"></sl-icon>
            ⁄ <sl-icon name="mouse-right-button" label="right button"></sl-icon>
            toggle</sl-checkbox>
        <sl-checkbox 
            help-text="For right drag, long hold then move finger"
            data-setting="rightButtonLongPress"
            ?checked=${settings.rightButtonLongPress}
          >Long press for right click</sl-checkbox>
        <sl-checkbox 
            help-text="For right drag, lift second finger then move first finger"
            data-setting="rightButtonTwoFingerTap"
            ?checked=${settings.rightButtonTwoFingerTap}
          >Two finger tap for right click</sl-checkbox>
        <sl-checkbox
            help-text="Click sound on long press or two finger tap"
          >Audio feedback</sl-checkbox>
        <sl-range
            label="Detection time"
            data-setting="rightButtonTimeout"
            value=${settings.rightButtonTimeout}
            min="100"
            max="1000"
            step="25"
            help-text="Long press length/​maximum delay for two finger tap"
            .tooltipFormatter=${(value: number) => `${value} ms`}
          ></sl-range>
      </sl-details>
    `;
  }

  private renderAdvancedSection() {
    return html`
      <sl-details summary="Advanced">
        <div><sl-button>Clear data</sl-button></div>
        <sl-checkbox
            help-text="Experimental puzzles in development (may have lots of bugs!)"
          >Show unfinished puzzles</sl-checkbox>
      </sl-details>
    `;
  }

  private async handlePuzzlePreferencesChange(event: PuzzleConfigChangeEvent) {
    if (this.puzzle) {
      // Persist only the changed preferences to the DB
      await settings.setPuzzlePreferences(this.puzzle.puzzleId, event.detail.changes);
    }
  }

  private handleSettingsChange(event: Event) {
    // Generic sl-change handler binding controls with data-setting to settings store.
    const target = event.target as HTMLInputElement; // same API as sl form controls
    const setting = target.getAttribute("data-setting");

    if (!setting) {
      // Controls that handle their own change events
      // (e.g., within puzzle-preferences-form)
      return;
    }

    assertHasWritableProperty(
      settings,
      setting,
      () => `Invalid data-setting="${setting}"`,
    );

    let value: boolean | number;
    const tag = target.tagName.toLowerCase();
    switch (tag) {
      case "sl-checkbox":
        value = target.checked ?? false;
        break;
      case "sl-range":
        value = Number.parseInt(String(target.value));
        break;
      default:
        throw new Error(`Unsupported tag in <${tag} data-setting="${setting}">`);
    }

    if (import.meta.env.DEV) {
      // Double check value type in development
      const oldType = typeof settings[setting];
      const newType = typeof value;
      if (oldType !== "undefined" && oldType !== newType) {
        throw new Error(
          `Mismatched type in <${tag} data-setting="${setting}">:
          expected ${oldType} got ${newType} for ${value}`,
        );
      }
    }

    settings[setting] = value;
  }

  get open() {
    return this.dialog?.open ?? false;
  }
  set open(isOpen: boolean) {
    if (isOpen) {
      this.dialog?.show();
    } else {
      this.dialog?.hide();
    }
  }

  async show() {
    if (!this.dialog?.open) {
      // Make sure puzzle-preferences-form is displaying current values
      await this.shadowRoot?.querySelector("puzzle-preferences-form")?.reloadValues();
    }
    return this.dialog?.show();
  }

  async hide() {
    return this.dialog?.hide();
  }

  static styles = css`
    :host {
      display: contents;
    }

    sl-dialog::part(body) {
      display: flex;
      flex-direction: column;
      gap: var(--sl-spacing-large);
      padding-block-start: 0; /* header is also padded */
    }
    
    sl-dialog::part(panel) {
      background-color: var(--sl-color-neutral-50);
    }
    
    sl-details[open]::part(header) {
      border-block-end: 1px solid var(--sl-color-neutral-200);
    }
    
    sl-details::part(content) {
      display: flex;
      flex-direction: column;
      gap: var(--sl-spacing-medium);
    }
    
    .help {
      /* match help-text in various controls */
      font-size: var(--sl-input-help-text-font-size-medium);
      color: var(--sl-input-help-text-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "settings-dialog": SettingsDialog;
  }
}
