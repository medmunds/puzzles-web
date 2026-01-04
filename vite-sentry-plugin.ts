// Workaround for sentryVitePlugin creating unnecessary JS chunks for html pages.
// https://github.com/getsentry/sentry-javascript-bundler-plugins/issues/829.

import {
  sentryVitePlugin as originalPlugin,
  type SentryVitePluginOptions,
} from "@sentry/vite-plugin";
import type { Plugin } from "vite";

// (Unclear what the full list should be here; this works for us.)
const nonModuleExtensions = [".html", ".css", ".json", ".wasm"];

const isNonModuleId = (id: string) => {
  const baseId = id.split("?")[0];
  return nonModuleExtensions.some((ext) => baseId.endsWith(ext));
};

/**
 * Patch a plugin to stop it from running transform or renderChunk on non-module chunks.
 */
function patch(plugin: Plugin): Plugin {
  const {
    transform: originalTransform,
    renderChunk: originalRenderChunk,
    ...rest
  } = plugin;

  let transform: Plugin["transform"] = originalTransform;
  if (transform) {
    const transformHandler =
      typeof originalTransform === "function"
        ? originalTransform
        : originalTransform?.handler;
    if (!transformHandler) {
      throw new Error(`${plugin.name} transform hook has no handler`);
    }

    const wrappedTransform: Plugin["transform"] = function (code, id, ...args) {
      if (isNonModuleId(id)) {
        // console.log(`${plugin.name}: skipping transform for ${id}`);
        return null;
      }
      return transformHandler.call(this, code, id, ...args);
    };
    transform =
      typeof originalTransform === "function"
        ? wrappedTransform
        : { ...originalTransform, handler: wrappedTransform };
  }

  let renderChunk: Plugin["renderChunk"] = originalRenderChunk;
  if (renderChunk) {
    const renderChunkHandler =
      typeof originalRenderChunk === "function"
        ? originalRenderChunk
        : originalRenderChunk?.handler;
    if (!renderChunkHandler) {
      throw new Error(`${plugin.name} renderChunk hook has no handler`);
    }

    const wrappedRenderChunk: Plugin["renderChunk"] = function (code, chunk, ...args) {
      if (chunk.facadeModuleId && isNonModuleId(chunk.facadeModuleId)) {
        // console.log(
        //   `${plugin.name}: skipping renderChunk for ${chunk.fileName} (${chunk.facadeModuleId})`,
        // );
        return null;
      }
      return renderChunkHandler.call(this, code, chunk, ...args);
    };
    renderChunk =
      typeof originalRenderChunk === "function"
        ? wrappedRenderChunk
        : { ...originalRenderChunk, handler: wrappedRenderChunk };
  }

  return { transform, renderChunk, ...rest };
}

/**
 * Patched @sentry/vite-plugin that avoids creating unnecessary JS chunks for html pages.
 */
export const sentryVitePlugin = (options?: SentryVitePluginOptions) => {
  const original = originalPlugin(options);
  return Array.isArray(original) ? original.map(patch) : patch(original);
};
