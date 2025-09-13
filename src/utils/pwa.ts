// Progressive Web App utils
/// <reference types="vite-plugin-pwa/vanillajs" />
import { registerSW } from "virtual:pwa-register";
import * as Sentry from "@sentry/browser";
import { sleep } from "./timing.ts";

if (typeof window === "undefined") {
  throw new Error("PWAManager must run on main thread");
}

class PWAManager {
  private _updateAvailable = false;
  private _offlineReady = false;

  private updateSW?: (reloadPage?: boolean) => Promise<void>;
  private updateAvailableCallback?: () => void;

  /**
   * True if a service worker update was available at last check.
   * (Use checkForUpdate() to refresh.)
   */
  get updateAvailable(): boolean {
    return this._updateAvailable;
  }

  /**
   * True if the app is fully cached for offline use.
   */
  get offlineReady(): boolean {
    return this._offlineReady;
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
        this._updateAvailable = true;
        this.updateAvailableCallback?.();
        // TODO: auto-update?
      },
      onOfflineReady: () => {
        console.log("App is ready for offline use");
        this._offlineReady = true;
      },
    });
  }

  /**
   * Force workbox to check for updates. If one is found, onNeedRefresh will set
   * this._updateAvailable and then resolve via this.updateAvailableCallback.
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
  async checkForUpdate(timeout = 10_000): Promise<boolean> {
    try {
      // Use Promise.race to ensure we don't hang indefinitely
      await Promise.race([this.performUpdateCheck(), sleep(timeout)]);
    } catch (error) {
      Sentry.captureException(error);
      console.error("PWAManager.checkForUpdate failed:", error);
    }
    return this.updateAvailable;
  }

  /**
   * Activate a pending service worker update and reload the page.
   */
  async installUpdate(): Promise<void> {
    await this.updateSW?.(/* reloadPage= */ true);
    this._updateAvailable = false;
  }
}

// Export singleton instance
export const pwaManager = new PWAManager();
