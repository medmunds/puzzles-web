/// <reference types="vite/client" />

interface ViteTypeOptions {
  // Makes the type of ImportMetaEnv strict to disallow unknown keys.
  strictImportMetaEnv: unknown;
}

interface ImportMetaEnv {
  readonly VITE_APP_NAME?: string;
  readonly VITE_GIT_SHA?: string;
  readonly VITE_SENTRY_DSN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
