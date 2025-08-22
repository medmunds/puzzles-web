/// <reference types="vite/client" />

// biome-ignore lint/correctness/noUnusedVariables: ambient vite typing
interface ViteTypeOptions {
  // Makes the type of ImportMetaEnv strict to disallow unknown keys.
  strictImportMetaEnv: unknown;
}

interface ImportMetaEnv {
  readonly VITE_GIT_SHA?: string;
  readonly VITE_SENTRY_DSN?: string;
}

// biome-ignore lint/correctness/noUnusedVariables: ambient vite typing
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
