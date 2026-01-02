/// <reference types="vite/client" />

interface ViteTypeOptions {
  // Makes the type of ImportMetaEnv strict to disallow unknown keys.
  strictImportMetaEnv: unknown;
}

interface ImportMetaEnv {
  readonly VITE_ANALYTICS_BLOCK: string; // raw html injected in pages
  readonly VITE_APP_NAME?: string;
  readonly VITE_APP_VERSION?: string;
  readonly VITE_CANONICAL_BASE_URL: string;
  readonly VITE_GIT_SHA?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_SENTRY_FILTER_APPLICATION_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __PUZZLE_IDS__: string[];
