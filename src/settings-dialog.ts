import type { WaSelectEvent } from "@awesome.me/webawesome";
import type WaDialog from "@awesome.me/webawesome/dist/components/dialog/dialog.js";
import { consume } from "@lit/context";
import { SignalWatcher } from "@lit-labs/signals";
import { css, html, LitElement, nothing } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import { puzzleContext } from "./puzzle/contexts.ts";
import type { Puzzle } from "./puzzle/puzzle.ts";
import type { PuzzleConfigChangeEvent } from "./puzzle/puzzle-config.ts";
import { savedGames } from "./store/saved-games.ts";
import { settings } from "./store/settings.ts";
import { audioClick } from "./utils/audio.ts";
import { autoBind } from "./utils/autobind.ts";
import { cssNative, cssWATweaks } from "./utils/css.ts";
import { clamp } from "./utils/math.ts";
import { isRunningAsApp, pwaManager } from "./utils/pwa.ts";
import { sleep } from "./utils/timing.ts";

// Register components
import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/checkbox/checkbox.js";
import "@awesome.me/webawesome/dist/components/details/details.js";
import "@awesome.me/webawesome/dist/components/dialog/dialog.js";
import "@awesome.me/webawesome/dist/components/dropdown/dropdown.js";
import "@awesome.me/webawesome/dist/components/dropdown-item/dropdown-item.js";
import "@awesome.me/webawesome/dist/components/icon/icon.js";
import "@awesome.me/webawesome/dist/components/slider/slider.js";
import "@awesome.me/webawesome/dist/components/spinner/spinner.js";

const MAX_SCALE_MIN = 0.25;
const MAX_SCALE_MAX = 2.75; // stand-in for "infinity" in maxScale slider
const MAX_SCALE_STEP = 0.25;

@customElement("settings-dialog")
export class SettingsDialog extends SignalWatcher(LitElement) {
  @consume({ context: puzzleContext, subscribe: true })
  @state()
  private puzzle?: Puzzle;

  @query("wa-dialog", true)
  private dialog?: WaDialog;

  protected override render() {
    return html`
      <wa-dialog label="Preferences" light-dismiss>
        ${this.renderPuzzleSection()}
        ${this.renderAppearanceSection()}
        ${this.renderMouseButtonsSection()}
        ${this.renderDataSection()}
        ${this.renderAdvancedSection()}
      </wa-dialog>
    `;
  }

  private renderPuzzleSection() {
    if (!this.puzzle) {
      // Preferences from index page: skip puzzle specific section.
      return nothing;
    }

    const puzzleName = this.puzzle.displayName;

    // Use autosubmit on the puzzle-preferences-form to apply changes immediately.
    // (settings-dialog does not use OK/Cancel flow.)
    return html`
      <wa-details open>
        <div slot="summary">${puzzleName} preferences</div>
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
            ?checked=${autoBind(settings, "showEndNotification")}
            hint="Victory message with “New game” button"
          >Show popup when solved</wa-checkbox>
        <wa-checkbox
            ?checked=${autoBind(settings, "showPuzzleKeyboard")}
            hint="On-screen buttons for puzzles that need keyboard input"
          >Show virtual keyboard</wa-checkbox>
        <wa-checkbox
            ?checked=${autoBind(settings, "showStatusbar")}
            hint="Text below some puzzles (you might need it to solve them)"
          >Show status bar</wa-checkbox>
        <wa-slider
            label="Maximum puzzle scale"
            hint="How far to stretch smaller puzzles to fill the screen"
            .value=${clamp(MAX_SCALE_MIN, settings.maxScale, MAX_SCALE_MAX)}
            min=${MAX_SCALE_MIN}
            max=${MAX_SCALE_MAX}
            step=${MAX_SCALE_STEP}
            with-markers
            with-tooltip
            .valueFormatter=${(value: number) => (value >= MAX_SCALE_MAX ? "As large as fits" : `${Math.round(value * 100)}%`)}
            @change=${(event: Event) => {
              // (Special case for non-standard handling; no data-setting attr.)
              const value = Number.parseFloat((event.target as HTMLInputElement).value);
              settings.maxScale =
                value >= MAX_SCALE_MAX ? Number.POSITIVE_INFINITY : value;
            }}
        >
          <span slot="reference">${Math.round(MAX_SCALE_MIN * 100)}%</span>
          <span slot="reference" class="scale-1x">100%</span>
          <span slot="reference" class="scale-2x">200%</span>
          <span slot="reference">Max</span>
        </wa-slider>
      </wa-details>
    `;
  }

  private renderMouseButtonsSection() {
    // The wa-sliders use .value prop rather than value attr binding
    // to work around a bug where changes to the value attr aren't rendered.
    // https://github.com/shoelace-style/webawesome/issues/1273
    return html`
      <wa-details summary="Mouse buttons">
        <div class="hint">
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
              const volume = Number.parseInt(slider.value, 10);
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

  private renderDataSection() {
    return html`
      <wa-details summary="Data" @wa-select=${this.handleDataCommand}>
        <div class="hint">
          Saved games, preferences and other puzzle data are kept in
          ${isRunningAsApp ? "this app’s" : "your browser’s"} local storage
        </div>
        <div>
          <wa-dropdown>
            <wa-button slot="trigger" with-caret>Backups</wa-button>
            <wa-dropdown-item value="settings-backup">Export preferences file&hellip;</wa-dropdown-item>
            <wa-dropdown-item value="settings-restore">Import preferences file&hellip;</wa-dropdown-item>
          </wa-dropdown>
          <div class="hint">
            Copy your settings to another device 
            (or preserve them when deleting and reinstalling the app) 
          </div>
        </div>
        <div>
          <wa-dropdown>
            <wa-button 
                slot="trigger" 
                appearance="filled outlined" 
                variant="danger" 
                with-caret
            >Clear data&hellip;</wa-button>
            <wa-dropdown-item value="clear-settings">Reset preferences and favorites</wa-dropdown-item>
            <wa-dropdown-item value="clear-games-autosave">Delete games in progress</wa-dropdown-item>
            <wa-dropdown-item value="clear-games-user">Delete saved games</wa-dropdown-item>
            <wa-dropdown-item value="clear-all" variant="danger">
              Clear <strong>ALL</strong> saved data</wa-dropdown-item>
          </wa-dropdown>
          <div class="hint">
            Delete some or all stored data <em>(permanently!)</em>
          </div>
        </div>
      </wa-details>
    `;
  }

  private renderAdvancedSection() {
    return html`
      <wa-details summary="Advanced">
        <wa-checkbox
            ?checked=${autoBind(settings, "showIntro")}
          >Show intro message</wa-checkbox>
        <wa-checkbox
            hint="Experimental puzzles in development (may have lots of bugs!)"
            ?checked=${autoBind(settings, "showUnfinishedPuzzles")}
          >Show unfinished puzzles</wa-checkbox>
        <wa-checkbox 
            ?checked=${pwaManager.allowOfflineUse}
            @change=${this.handleAllowOfflineChange}
        >
          Allow offline use
          <div slot="hint">
            ${
              isRunningAsApp
                ? "(Keep this checked when installed as an app)"
                : html`
                  Downloads everything needed to run offline into your browser<br>
                  (it’s better to <a href="/help/install">install as an app</a> if possible)`
            }
          </div>
        </wa-checkbox>
        <wa-checkbox
          hint="Only applies when offline use is enabled"
          ?checked=${pwaManager.autoUpdate}
          ?disabled=${!pwaManager.allowOfflineUse}
          @change=${this.handleAutoUpdateChange}
        >
          Auto-update offline content (recommended)
        </wa-checkbox>
        <div class="offline-status">
          Offline content: ${this.renderOfflineStatus()}
        </div>
      </wa-details>
    `;
  }

  private renderOfflineStatus() {
    switch (pwaManager.status) {
      case "uninitialized":
        return html`<wa-spinner></wa-spinner> initializing&hellip;`;
      case "registering":
        return html`<wa-spinner></wa-spinner> registering&hellip;`;
      case "unregistered":
        return "not downloaded";
      case "registered":
        return html`
          up to date
          (<button @click=${this.handleCheckForUpdate}>check for updates</a>)
        `;
      case "downloading":
        return html`<wa-spinner></wa-spinner> downloading&hellip;`;
      case "download-ready":
        return html`
          downloaded
          (<button @click=${this.handleReloadApp}>reload</button> to activate)
        `;
      case "update-downloading":
        return html`<wa-spinner></wa-spinner> downloading update&hellip;`;
      case "update-ready":
        return html`
          update downloaded
          (<button @click=${this.handleInstallUpdate}>install now</button>)
        `;
      case "installing":
        return html`<wa-spinner></wa-spinner> installing&hellip;`;
      case "reloading":
        return html`<wa-spinner></wa-spinner> reloading&hellip;`;
      case "deleting":
        return html`<wa-spinner></wa-spinner> removing&hellip;`;
      case "deleted":
        return html`
          removed
          (<button @click=${this.handleReloadApp}>reload</button> to finish)
        `;
      case "error":
        return html`
          installation error
          (<button @click=${this.handleReloadApp}>reload app</button>)
        `;
      default:
        return `unknown (${pwaManager.status})`;
    }
  }

  private async handleCheckForUpdate() {
    await pwaManager.checkForUpdate();
  }

  private handleInstallUpdate() {
    pwaManager.installUpdate();
  }

  private handleReloadApp() {
    pwaManager.reloadApp();
  }

  private async handleAllowOfflineChange(event: UIEvent) {
    pwaManager.allowOfflineUse = (event.target as HTMLInputElement).checked;
  }

  private async handleAutoUpdateChange(event: UIEvent) {
    pwaManager.autoUpdate = (event.target as HTMLInputElement).checked;
  }

  // private async handleDataCommand(event: HTMLElementEventMap["wa-select"]) {
  private async handleDataCommand(event: WaSelectEvent) {
    const item = event.detail.item as HTMLElementTagNameMap["wa-dropdown-item"];
    const command = item.value;
    switch (command) {
      case "clear-settings": {
        // Ugh: need to preserve service worker status
        // (since user probably doesn't want to disable
        // offline as part of clearing settings)
        const wasAvailableOffline = settings.allowOfflineUse;
        await settings.clearAllSettings();
        if (wasAvailableOffline !== null) {
          pwaManager.allowOfflineUse = wasAvailableOffline;
        }
        break;
      }
      case "clear-games-autosave":
        await savedGames.removeAllAutoSavedGames();
        break;
      case "clear-games-user":
        await savedGames.removeAllSavedGames();
        break;
      case "clear-all":
        await Promise.all([
          settings.clearAllSettings().then(() => pwaManager.reinitialize()),
          savedGames.removeAll(),
        ]);
        break;
      case "settings-backup":
        await this.settingsBackup();
        break;
      case "settings-restore":
        await this.settingsRestore();
        break;
      default:
        if (!import.meta.env.PROD) {
          throw new Error(`Unknown command: ${command}`);
        }
        console.error(`Unknown settings-dialog data command: ${command}`);
        break;
    }
  }

  private async settingsBackup() {
    const backup = await settings.serialize();
    const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const filename = `puzzle-settings-${new Date().toISOString().slice(0, 10)}.json`;
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    await sleep(10);
    URL.revokeObjectURL(url);
  }

  private async settingsRestore() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (file) {
        try {
          const text = await file.text();
          const backup = JSON.parse(text);
          await settings.deserialize(backup);
          await this.reload();
          // TODO: Show success toast
        } catch (error) {
          // TODO: Show error toast
          console.error("Failed to restore settings:", error);
        }
      }
    };
    input.click();
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

  async reload() {
    // (Everything except puzzle-preferences-form is reactive)
    await this.shadowRoot?.querySelector("puzzle-preferences-form")?.reloadValues();
  }

  async show() {
    if (!this.dialog?.open) {
      // Make sure puzzle-preferences-form is displaying current values
      await this.reload();
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

  static styles = [
    cssWATweaks,
    cssNative, // for links
    css`
      :host {
        display: contents;
      }
  
      wa-dialog::part(body) {
        display: flex;
        flex-direction: column;
        gap: var(--wa-space-l);
        
        /* De-emphasize slider/input labels to match checkbox/radio labels */
        --wa-form-control-label-font-weight: var(--wa-form-control-value-font-weight);
      }
      
      wa-dialog::part(dialog) {
        background-color: var(--wa-color-brand-fill-quiet);
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
  
      /* Place the maxScale 100% and 200% labels below the appropriate markers */
      .scale-1x, .scale-2x {
        position: absolute;
        transform: translateX(calc(-50% + 0.5ch)); /* visually center */
      }
      .scale-1x {
        inset-inline-start: ${(100 * (1.0 - MAX_SCALE_MIN)) / (MAX_SCALE_MAX - MAX_SCALE_MIN)}%;
      }
      .scale-2x {
        inset-inline-start: ${(100 * (2.0 - MAX_SCALE_MIN)) / (MAX_SCALE_MAX - MAX_SCALE_MIN)}%;
      }
      
      .hint {
        /* match hint in various controls */
        color: var(--wa-form-control-hint-color);
        font-size: var(--wa-font-size-smaller);
        font-weight: var(--wa-form-control-hint-font-weight);
        line-height: var(--wa-form-control-hint-line-height);
      }
        
      wa-button + .hint,
      wa-dropdown + .hint {
        margin-block-start: var(--wa-space-xs);
      }

      wa-spinner {
        vertical-align: -2px; /* visual text-middle alignment*/
      }
      
      .offline-status button {
        /* Format offline-status buttons as links */
        display: inline-block;
        vertical-align: baseline;
        background: inherit;
        font-weight: inherit;
        font-size: inherit;
        padding: 0;
        margin: 0;
        border: none;
        
        color: var(--wa-color-text-link);
        text-decoration: var(--wa-link-decoration-default);
        -webkit-text-decoration: var(--wa-link-decoration-default); /* Safari */
        text-decoration-thickness: 0.09375em;
        text-underline-offset: 0.125em;

        @media (hover: hover)  {
          &:hover {
            color: color-mix(in oklab, var(--wa-color-text-link), var(--wa-color-mix-hover));
            text-decoration: var(--wa-link-decoration-hover);
            -webkit-text-decoration: var(--wa-link-decoration-hover); /* Safari */
          }
        }
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "settings-dialog": SettingsDialog;
  }
}
