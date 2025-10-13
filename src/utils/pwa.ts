// Progressive Web App utils
import { signal } from "@lit-labs/signals";
import * as Sentry from "@sentry/browser";
import { Workbox, type WorkboxLifecycleEvent } from "workbox-window";
import { sleep } from "./timing.ts";

if (typeof window === "undefined") {
  throw new Error("PWAManager must run on main thread");
}

/**
 * True if running as a standalone PWA app (not browser tab)
 */
export const isRunningAsApp = !window.matchMedia("(display-mode: browser)").matches;

/**
 * App update status
 * (the names are the state to communicate to the user;
 * don't confuse them with similarly-named service worker events)
 */
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

  private wb?: Workbox;

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
      this.installUpdate();
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
  async registerSW() {
    if (!("serviceWorker" in navigator)) {
      return;
    }
    if (import.meta.env.DEV) {
      // Skip service worker in dev (like vite-plugin-pwa does).
      // It interferes with HMR and generally causes confusion.
      // (You can allow it here for specific debugging.)
      return;
    }

    // Initialize Workbox
    const base = import.meta.env.BASE_URL;
    this.wb = new Workbox(`${base}sw.js`, { scope: base });

    this.wb.addEventListener("waiting", this.handleSWWaiting);
    this.wb.addEventListener("activated", this.handleSWActivated);
    this.wb.addEventListener("controlling", this.handleSWControlling);

    // Register the service worker
    try {
      await this.wb.register();
      if (this.updateStatus === UpdateStatus.Unknown) {
        this._updateStatus.set(UpdateStatus.UpToDate);
      }
    } catch (error) {
      console.error("Service worker registration failed:", error);
      Sentry.captureException(error);
      this._updateStatus.set(UpdateStatus.Error);
    }
  }

  private handleSWWaiting = (event: WorkboxLifecycleEvent) => {
    // Waiting service worker means update available.
    // workbox shouldn't send this for first install, but it *will* send it
    // with isUpdate undefined if there's a waiting worker at registration time.
    console.log(`SW waiting isUpdate=${event.isUpdate}`);
    if (event.isUpdate !== false) {
      this.handleUpdateWaiting();
    }
  };

  private handleSWActivated = (_event: WorkboxLifecycleEvent) => {
    // Precache is fully populated once it has handled the activated event.
    console.log("App is ready for offline use");
    this._offlineReady.set(true);
  };

  private handleSWControlling = (event: WorkboxLifecycleEvent) => {
    // Handle controlling event: reload all tabs when new SW takes control in any tab.
    // event.isExternal is true if some other tab is responsible, but we want to pick
    // up the new code everywhere. (Note this is not sent for first install unless
    // the service worker calls clients.claim(), and ours doesn't.)
    if (event.isUpdate) {
      console.log("New service worker activated, reloading page");
      window.location.reload();
    }
  };

  private handleUpdateWaiting() {
    // Change updateStatus to Available and initiate auto update if enabled
    console.log("App update available");
    this._updateStatus.set(UpdateStatus.Available);
    if (this.autoUpdate) {
      this.installUpdate();
    }
  }

  /**
   * Force an immediate service worker update check.
   *
   * If no service worker is installed (e.g., in dev mode) this will
   * show "checking" for the timeout duration and then indicate "up to date".
   */
  async checkForUpdate(timeout = 7_500) {
    if (this._updateStatus.get() === UpdateStatus.Checking) {
      // Another check is already in progress
      return;
    }
    this._updateStatus.set(UpdateStatus.Checking);

    // First see if there's already one waiting that we missed somehow
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration?.waiting) {
      console.log("Waiting registration found without waiting event");
      this.handleUpdateWaiting();
      return;
    }

    // Then force an update check with a timeout
    try {
      await Promise.race([this.wb?.update(), sleep(timeout)].filter(Boolean));
      await sleep(10); // ensure messages are delivered
    } catch (error) {
      console.error("PWAManager.checkForUpdate failed:", error);
      Sentry.captureException(error);
      this._updateStatus.set(UpdateStatus.Error);
    }
    if (this._updateStatus.get() === UpdateStatus.Checking) {
      // If we got here with no status change events, we're up to date
      this._updateStatus.set(UpdateStatus.UpToDate);
    }
  }

  /**
   * Activate a pending service worker update.
   * (This will result in a page reload once the update is complete.)
   */
  installUpdate() {
    if (!this.wb) {
      return;
    }

    this._updateStatus.set(UpdateStatus.Installing);
    // Tell the waiting service worker to skip waiting and activate.
    // The 'controlling' event listener will handle the reload when ready.
    this.wb.messageSkipWaiting();
  }
}

// Export singleton instance
export const pwaManager = new PWAManager();
