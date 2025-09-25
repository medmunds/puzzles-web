// Progressive Web App utils
/// <reference types="vite-plugin-pwa/vanillajs" />
import { registerSW } from "virtual:pwa-register";
import { signal } from "@lit-labs/signals";
import * as Sentry from "@sentry/browser";
import { sleep } from "./timing.ts";

if (typeof window === "undefined") {
  throw new Error("PWAManager must run on main thread");
}

export enum UpdateStatus {
  Unknown = 0,
  UpToDate,
  Checking,
  Available,
  Installing,
  Error,
}

class PWAManager {
  private _autoUpdate = true;
  private _offlineReady = signal<boolean>(false);
  private _updateStatus = signal<UpdateStatus>(UpdateStatus.Unknown);

  private updateSW?: (reloadPage?: boolean) => Promise<void>;
  private updateAvailableCallback?: () => void;

  /**
   * Reactive service worker update status.
   */
  get updateStatus(): UpdateStatus {
    return this._updateStatus.get();
  }

  get autoUpdate(): boolean {
    return this._autoUpdate;
  }

  set autoUpdate(value: boolean) {
    this._autoUpdate = value;
    if (this._autoUpdate && this.updateStatus === UpdateStatus.Available) {
      this.installUpdate().catch((error: Error) => Sentry.captureException(error));
    }
  }

  /**
   * True if the app is fully cached for offline use.
   */
  get offlineReady(): boolean {
    return this._offlineReady.get();
  }

  /**
   * Register the PWA service worker.
   * The app must call this (relatively early) to enable caching and offline use.
   */
  registerSW() {
    // Install PWA service worker (from vite-pwa)
    this.updateSW = registerSW({
      onNeedRefresh: () => {
        console.log("App update available");
        this._updateStatus.set(UpdateStatus.Available);
        this.updateAvailableCallback?.();
        if (this.autoUpdate) {
          this.installUpdate().catch((error: Error) => Sentry.captureException(error));
        }
      },
      onOfflineReady: () => {
        console.log("App is ready for offline use");
        this._offlineReady.set(true);
      },
    });
  }

  /**
   * Force workbox to check for updates. If one is found, onNeedRefresh will set
   * this.updateStatus and then resolve via this.updateAvailableCallback.
   *
   * Note that this might never resolve if a service worker is not in use
   * (e.g., in dev mode).
   */
  private async performUpdateCheck() {
    return new Promise<void>((resolve, reject) => {
      this.updateAvailableCallback = () => {
        this.updateAvailableCallback = undefined;
        resolve();
      };
      navigator.serviceWorker.ready
        .then((registration) => registration.update())
        .catch((error) => {
          this.updateAvailableCallback = undefined;
          reject(error);
        });
    });
  }

  /**
   * Force an immediate service worker update check.
   * Resolves true if an update is available.
   */
  async checkForUpdate(timeout = 7_500): Promise<boolean> {
    this._updateStatus.set(UpdateStatus.Checking);
    try {
      // Use Promise.race to ensure we don't hang indefinitely
      await Promise.race([this.performUpdateCheck(), sleep(timeout)]);
    } catch (error) {
      this._updateStatus.set(UpdateStatus.Error);
      Sentry.captureException(error);
      console.error("PWAManager.checkForUpdate failed:", error);
    }
    if (this.updateStatus === UpdateStatus.Checking) {
      // Timed out without some other status, so no update needed
      this._updateStatus.set(UpdateStatus.UpToDate);
    }
    return this.updateStatus === UpdateStatus.Available;
  }

  /**
   * Activate a pending service worker update and reload the page.
   */
  async installUpdate(): Promise<void> {
    if (!this.updateSW) {
      return;
    }

    this._updateStatus.set(UpdateStatus.Installing);
    try {
      await this.updateSW(/* reloadPage= */ true);
    } catch (error) {
      this._updateStatus.set(UpdateStatus.Error);
      throw error;
    }
    // Just leave updateStatus as Installing until page reload completes
    // (e.g., if installation is stalled by another open tab)
  }
}

// Export singleton instance
export const pwaManager = new PWAManager();
