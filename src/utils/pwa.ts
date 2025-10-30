// Progressive Web App utils
import { computed, signal } from "@lit-labs/signals";
import * as Sentry from "@sentry/browser";
import {
  Workbox,
  type WorkboxLifecycleEvent,
  type WorkboxMessageEvent,
} from "workbox-window";
import { settings } from "../store/settings.ts";
import { sleep } from "./timing.ts";

if (typeof window === "undefined") {
  throw new Error("PWAManager must run on main thread");
}

/**
 * True if running as a standalone PWA app (not browser tab)
 */
export const isRunningAsApp = !window.matchMedia("(display-mode: browser)").matches;

/**
 * Offline status, condensed to a single state for communicating to the user:
 * see the lifecycle below.
 * (Careful you don't confuse PWAManagerStatus with similarly named
 * ServiceWorker.state values, which have very different meanings.)
 */
export type PWAManagerStatus =
  | "uninitialized" // PWAManager not initialized
  | "unregistered" // offline use not enabled
  | "registering" // should quickly transition to registered or downloading
  | "registered" // service worker active and everything up to date
  | "downloading" // initial service worker "installing"
  | "download-ready" // initial service worker "installed"
  | "checking-for-updates"
  | "update-downloading" // updated service worker "installing"
  | "update-ready" // updated service worker "installed", waiting for activation
  | "installing" // skipWaiting called on updated service worker
  | "reloading" // page is reloading to finalize changes
  | "deleting"
  | "deleted" // will become "unregistered" on reload
  | "error";

// PWAManager status and lifecycle:
//
// Offline use not enabled:
//   status=uninitialized
// pwaManager.initialize()
//   status=unregistered
//
// Offline use enabled (and service worker previously installed):
//   status=uninitialized
// pwaManager.initialize()
//   status=registering
//   status=registered
//
// First install:
//   status=unregistered
// pwaManager.allowOfflineUse = true
//   status=registering
//   status=downloading
//     downloadProgress will advance from 0 to 100
//   status=download-ready
// pwaManager.reloadApp() (*not* called automatically)
//   status=reloading
//   status=registered
//
// Updates - explicit check:
//   status=registered (and up to date)
// pwaManager.checkForUpdates()
//   status=checking-for-updates (if no updates, returns to status=active)
//   status=update-downloading
//     downloadProgress will advance from 0 to 100
//     pendingVersion will be set
//   status=update-ready
//     pendingVersion will be set
// pwaManager.installUpdate() (called automatically if autoUpdate enabled)
//   status=installing
//   status=reloading
//   status=registered (and up to date)
//
// Updates - implicit check (by browser or on schedule)
//   status=registered
//   status=update-downloading (spontaneous transition)
//   ... continue as in explicit check above
//
// Uninstall:
//   status=registered
// pwaManager.allowOfflineUse = false
//   status=deleting
//   status=deleted
// pwaManager.reloadApp() (*not* called automatically)
//   status=reloading
//   status=unregistered
//
// Any of the above sequences can lead to status=error

class PWAManager {
  private _allowOfflineUse = computed(() => settings.allowOfflineUse ?? isRunningAsApp);
  private _autoUpdate = computed(() => settings.autoUpdate ?? this.allowOfflineUse);
  private _status = signal<PWAManagerStatus>("uninitialized");
  private _downloadProgress = signal<number | undefined>(undefined);

  private wb?: Workbox;

  /**
   * Install the offline service worker if requested.
   * The app should call this from the window.load event.
   */
  async initialize() {
    if (this.allowOfflineUse) {
      await this.registerSW();
    } else {
      this._status.set("unregistered");
    }
  }

  /**
   * Sync service worker installation state with settings state.
   * (Call after resetting settings.)
   */
  async reinitialize() {
    if (this.allowOfflineUse && !this.wb) {
      await this.registerSW();
    } else if (!this.allowOfflineUse && this.wb) {
      await this.unregisterSW();
    }
  }

  /**
   * Whether to register service worker and install offline assets.
   */
  get allowOfflineUse(): boolean {
    return this._allowOfflineUse.get();
  }

  set allowOfflineUse(value: boolean) {
    if (value !== settings.allowOfflineUse) {
      settings.allowOfflineUse = value;
      void this.reinitialize();
    }
  }

  /**
   * Whether to automatically update offline assets to new version when available.
   * (Even when disabled, browser may switch to new version on page load.)
   */
  get autoUpdate(): boolean {
    return this._autoUpdate.get();
  }

  set autoUpdate(value: boolean) {
    settings.autoUpdate = value;
    if (value && this.status === "update-ready") {
      this.installUpdate();
    }
  }

  /**
   * Reactive service worker status.
   */
  get status(): PWAManagerStatus {
    return this._status.get();
  }

  get downloadProgress(): number | undefined {
    return this._downloadProgress.get();
  }

  /**
   * Activate a pending service worker update.
   * (This will result in a page reload once the update is complete.)
   */
  installUpdate() {
    // Tell the waiting service worker to skip waiting and activate.
    // The 'controlling' event listener will handle the reload when ready.
    if (this.status === "download-ready" || this.status === "update-ready") {
      this._status.set("installing");
    }
    this.wb?.messageSkipWaiting();
  }

  /**
   * Reload page to finalize service worker activation/deletion
   */
  reloadApp() {
    this._status.set("reloading");
    window.location.reload();
  }

  /**
   * Force an immediate service worker update check.
   *
   * If no service worker is installed (e.g., in dev mode) this will
   * show "checking" for the timeout duration and then indicate "up to date".
   */
  async checkForUpdate(timeout = 7_500) {
    if (this.status !== "registered") {
      // Some other operation (perhaps another checkForUpdate)
      // is already in progress
      return;
    }
    this._status.set("checking-for-updates");

    // Then force an update check with a timeout
    try {
      await Promise.race([this.wb?.update(), sleep(timeout)].filter(Boolean));
      await sleep(10); // ensure messages are delivered
    } catch (error) {
      console.error("PWAManager.checkForUpdate failed:", error);
      Sentry.captureException(error);
      this._status.set("error");
    }
    if (this._status.get() === "checking-for-updates") {
      // If we got here with no status change events, we were already up to date
      this._status.set("registered");
    }
  }

  //
  // Private methods
  //

  private async registerSW() {
    this._status.set("registering");

    // Initialize Workbox
    const base = import.meta.env.BASE_URL;
    this.wb = new Workbox(`${base}sw.js`, { scope: base });

    // Workbox's own events are somewhat unreliable.
    // (See, e.g., https://github.com/GoogleChrome/workbox/issues/3123.)
    // Listen only for "controlling", which is necessary to coordinate
    // cross-tab activation of updated service workers.
    this.wb.addEventListener("controlling", this.handleSWControlling);

    // Get download progress events
    this.wb.addEventListener("message", this.handleSWMessage);

    // Register the service worker
    try {
      const registration = await this.wb.register();
      if (registration) {
        this.observeRegistration(registration);
      } else {
        this._status.set("error"); // ???
      }
    } catch (error) {
      console.error("Service worker registration failed:", error);
      Sentry.captureException(error);
      this._status.set("error");
    }
  }

  private observeRegistration(registration: ServiceWorkerRegistration) {
    // Listen for new workers appearing
    registration.addEventListener("updatefound", () => {
      const newWorker = registration.installing;
      if (newWorker) {
        const isUpdate = Boolean(registration.active);
        this._status.set(isUpdate ? "update-downloading" : "downloading");
        this.observeWorker(newWorker, isUpdate);
      }
    });

    // Also observe any workers that already exist
    const isUpdate = Boolean(registration.active);
    if (registration.active) {
      this._status.set("registered");
      // (unless superseded by a waiting or installing worker)
    }
    if (registration.waiting) {
      this.observeWorker(registration.waiting, isUpdate);
    }
    if (registration.installing) {
      this.observeWorker(registration.installing, isUpdate);
    }
  }

  private observedWorkers: WeakSet<ServiceWorker> = new WeakSet();

  private observeWorker(worker: ServiceWorker, isUpdate: boolean) {
    if (this.observedWorkers.has(worker)) {
      return;
    }
    this.observedWorkers.add(worker);

    const handleStateChange = () => {
      switch (worker.state) {
        case "installing":
          this._status.set(isUpdate ? "update-downloading" : "downloading");
          break;
        case "installed":
          if (isUpdate) {
            // Updated worker has finished installing and is now waiting
            this._status.set("update-ready");
            if (this.autoUpdate) {
              this.installUpdate();
            }
          }
          // otherwise it's the initial install; hold out for "activated"
          break;
        case "activated":
          if (!isUpdate) {
            // initial install has finished activating and is now waiting
            this._status.set("download-ready");
          }
          // otherwise it's an update during skipWaiting;
          // no status change to communicate
          break;
        case "redundant":
          // no action needed: this is either expected when a worker is replaced
          // during normal operation, or a failure while installing/activating
          // a worker (which should throw from wb.register() above).
          console.log("Worker becoming redundant", worker);
          break;
      }
    };

    worker.addEventListener("statechange", handleStateChange);

    // Handle initial state
    handleStateChange();
  }

  private handleSWControlling = (event: WorkboxLifecycleEvent) => {
    // Handle controlling event: reload all tabs when new SW takes control in any tab.
    // event.isExternal is true if some other tab is responsible, but we want to pick
    // up the new code everywhere. (We do this even when autoUpdate is false, because
    // the event occurs in response to calling skipWaiting.)
    if (!event.isUpdate) {
      // This event is not sent for first install unless the service worker calls
      // clients.claim() (and ours doesn't)
      console.warn(`Unexpected SW controlling event, isUpdate=${event.isUpdate}`);
    }
    console.log("New service worker ready, reloading page");
    this.reloadApp();
  };

  private handleSWMessage = (event: WorkboxMessageEvent) => {
    switch (event.data?.type) {
      case "PRECACHE_PROGRESS": {
        const { count, total } = event.data;
        const progress = total > 0 ? Math.round((count / total) * 100) : 50;
        this._downloadProgress.set(progress);
        break;
      }
      case "PRECACHE_COMPLETE":
        this._downloadProgress.set(undefined);
        break;
    }
  };

  /**
   * Unregister the service worker and remove all caches
   */
  private async unregisterSW() {
    this._status.set("deleting");
    try {
      // Unregister the service worker
      const registration = await navigator.serviceWorker?.getRegistration();
      await registration?.unregister();

      // Delete all caches created by the service worker
      // (Workbox uses predictable cache names, but safest to just delete all)
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));

      console.log(
        `Unregistered service worker and deleted ${cacheNames.length} cache(s)`,
      );

      // Reset state
      this.wb = undefined;
      this._status.set("deleted");
    } catch (error) {
      console.error("Failed to unregister service worker:", error);
      Sentry.captureException(error);
      this._status.set("error");
    }
  }
}

// Export singleton instance
export const pwaManager = new PWAManager();
