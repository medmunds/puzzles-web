import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

declare global {
  // RegExp.escape available in node v24
  // https://github.com/microsoft/TypeScript/issues/61321
  interface RegExpConstructor {
    escape(str: string): string;
  }
}

/**
 * Workaround a vite (rollup) bug that fails to include .wasm.map files
 * in dist/assets when the .wasm files are fetched with dynamic import.
 * Also prevent vite from emitting unused (and content-free) .js.map
 * file(s) related to the dynamic import resolution.
 */
export const wasmSourcemaps = (): Plugin => ({
  name: "wasm-sourcemaps",
  apply: "build",
  async generateBundle(_options, bundle) {
    // Patch the emitted (hashed) WASM assets to point to corresponding map assets
    for (const [fileName, asset] of Object.entries(bundle)) {
      if (fileName.endsWith(".wasm") && asset.type === "asset") {
        // Recreate the original source file path (not available in asset info).
        const baseName = path.basename(fileName, ".wasm");
        const puzzleName = baseName.replace(/-[a-zA-Z0-9_-]+$/, "");
        const originalPath = path.join(
          "src",
          "assets",
          "puzzles",
          `${puzzleName}.wasm`,
        );

        // Mark spurious .js.map files for deletion
        const spuriousMapPattern = new RegExp(
          `^${RegExp.escape(path.dirname(fileName))}/${RegExp.escape(puzzleName)}-[a-zA-Z0-9_-]+\\.js\\.map$`,
        );
        for (const bundleFileName of Object.keys(bundle)) {
          if (spuriousMapPattern.test(bundleFileName)) {
            delete bundle[bundleFileName];
          }
        }

        // Provide .wasm.map asset
        const mapPath = `${originalPath}.map`;
        if (fs.existsSync(mapPath)) {
          // Update the WASM binary to use a hashed sourceMappingURL
          const hashedMapName = `${fileName}.map`;
          const hashedMapBaseName = path.basename(hashedMapName);
          const source = asset.source as Uint8Array;
          const updatedWasm = updateWasmSourceMappingURL(source, hashedMapBaseName);
          if (!updatedWasm) {
            console.warn(
              `[vite-wasm-sourcemaps] Could not find sourceMappingURL section in ${fileName}, skipping update`,
            );
          } else {
            asset.source = updatedWasm;

            // Emit the matching -<hash>.wasm.map asset
            const mapSource = fs.readFileSync(mapPath);
            this.emitFile({
              type: "asset",
              fileName: hashedMapName,
              source: mapSource,
            });
          }
        }
      }
    }
  },
});

//
// WASM Binary manipulation helpers
// (AI generated: Claude 4.5 Sonnet)
//

/**
 * Encodes a string as UTF-8 bytes with LEB128 length prefix
 */
function encodeNameWithLength(name: string): Uint8Array {
  const nameBytes = new TextEncoder().encode(name);
  const lengthBytes = encodeLEB128(nameBytes.length);
  const result = new Uint8Array(lengthBytes.length + nameBytes.length);
  result.set(lengthBytes, 0);
  result.set(nameBytes, lengthBytes.length);
  return result;
}

/**
 * Encodes an unsigned integer as LEB128 (variable-length encoding)
 */
function encodeLEB128(value: number): Uint8Array {
  const bytes: number[] = [];
  do {
    let byte = value & 0x7f;
    value >>>= 7;
    if (value !== 0) {
      byte |= 0x80; // More bytes to come
    }
    bytes.push(byte);
  } while (value !== 0);
  return new Uint8Array(bytes);
}

/**
 * Decodes LEB128 unsigned integer, returns [value, bytesRead]
 */
function decodeLEB128(data: Uint8Array, offset: number): [number, number] {
  let result = 0;
  let shift = 0;
  let bytesRead = 0;
  let byte: number;
  do {
    byte = data[offset + bytesRead];
    result |= (byte & 0x7f) << shift;
    shift += 7;
    bytesRead++;
  } while (byte & 0x80);
  return [result, bytesRead];
}

/**
 * Updates the sourceMappingURL in a WASM binary's custom section
 */
function updateWasmSourceMappingURL(
  wasmBytes: Uint8Array,
  newUrl: string,
): Uint8Array | null {
  // WASM binary format:
  // - Magic number: 0x00 0x61 0x73 0x6d (4 bytes)
  // - Version: 0x01 0x00 0x00 0x00 (4 bytes)
  // - Sections: [section_id (1 byte), size (LEB128), content...]
  // Custom sections have id = 0

  let offset = 8; // Skip magic + version
  const sections: Array<{
    start: number;
    id: number;
    size: number;
    contentStart: number;
    contentEnd: number;
  }> = [];

  // Parse all sections
  while (offset < wasmBytes.length) {
    const start = offset;
    const id = wasmBytes[offset++];

    const [size, sizeBytes] = decodeLEB128(wasmBytes, offset);
    offset += sizeBytes;

    const contentStart = offset;
    const contentEnd = offset + size;

    sections.push({ start, id, size, contentStart, contentEnd });
    offset = contentEnd;
  }

  // Find sourceMappingURL custom section (id = 0, name = "sourceMappingURL")
  let targetSection: (typeof sections)[0] | undefined;
  for (const section of sections) {
    if (section.id === 0) {
      // Custom section - check the name
      const [nameLen, nameLenBytes] = decodeLEB128(wasmBytes, section.contentStart);
      const nameStart = section.contentStart + nameLenBytes;
      const name = new TextDecoder().decode(
        wasmBytes.subarray(nameStart, nameStart + nameLen),
      );
      if (name === "sourceMappingURL") {
        targetSection = section;
        break;
      }
    }
  }

  if (!targetSection) {
    return null; // No sourceMappingURL section found
  }

  // Parse the sourceMappingURL section content
  // The URL is stored as a null-terminated string (or just raw bytes to end of section)
  // Build new section content: "sourceMappingURL" name + new URL
  const sectionName = encodeNameWithLength("sourceMappingURL");
  const urlBytes = new TextEncoder().encode(newUrl);
  const newSectionContent = new Uint8Array(sectionName.length + urlBytes.length);
  newSectionContent.set(sectionName, 0);
  newSectionContent.set(urlBytes, sectionName.length);

  // Encode new section: id (0) + size (LEB128) + content
  const newSectionSize = encodeLEB128(newSectionContent.length);
  const newSection = new Uint8Array(
    1 + newSectionSize.length + newSectionContent.length,
  );
  newSection[0] = 0; // Custom section id
  newSection.set(newSectionSize, 1);
  newSection.set(newSectionContent, 1 + newSectionSize.length);

  // Rebuild WASM binary with replaced section
  const beforeSection = wasmBytes.subarray(0, targetSection.start);
  const afterSection = wasmBytes.subarray(targetSection.contentEnd);
  const newWasm = new Uint8Array(
    beforeSection.length + newSection.length + afterSection.length,
  );
  newWasm.set(beforeSection, 0);
  newWasm.set(newSection, beforeSection.length);
  newWasm.set(afterSection, beforeSection.length + newSection.length);

  return newWasm;
}
