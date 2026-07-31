import { describe, expect, it } from "vitest";

declare const __dirname: string;
declare function require(moduleName: string): unknown;

interface DirentLike {
  isDirectory(): boolean;
  name: string;
}

interface FsLike {
  existsSync(filePath: string): boolean;
  readdirSync(dir: string, options: { withFileTypes: true }): DirentLike[];
  readFileSync(filePath: string, encoding: "utf8"): string;
}

interface PathLike {
  join(...paths: string[]): string;
  relative(from: string, to: string): string;
  resolve(...paths: string[]): string;
}

const fs = require("node:fs") as FsLike;
const path = require("node:path") as PathLike;

const repoRoot = path.resolve(__dirname, "../../..");
const sourceRoot = path.join(repoRoot, "src");
const sourceExtensions = /\.(?:ts|tsx)$/;
const testFile = /\.test\.(?:ts|tsx)$/;
const importPattern = /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

interface SourceModule {
  path: string;
  source: string;
}

interface ImportBoundaryViolation {
  importer: string;
  specifier: string;
  message: string;
}

type Layer = "core" | "feature" | "plugin" | "plugin-sdk" | null;

function layerFor(modulePath: string): Layer {
  if (modulePath.startsWith("src/core/")) return "core";
  if (modulePath.startsWith("src/features/")) return "feature";
  if (modulePath.startsWith("src/plugins/")) return "plugin";
  if (modulePath.startsWith("src/plugin-sdk/")) return "plugin-sdk";
  return null;
}

function featureName(modulePath: string): string | null {
  const match = /^src\/features\/([^/]+)\//.exec(modulePath);
  return match?.[1] ?? null;
}

function isExactPublicEntrypoint(specifier: string, root: string): boolean {
  return specifier === root;
}

function boundaryMessage(importer: string, specifier: string): string | null {
  const layer = layerFor(importer);
  if (!layer) return null;

  if (layer === "core" && specifier.startsWith("@/plugins/")) {
    return "core must not import plugin implementations";
  }

  if (layer === "plugin") {
    if (specifier.startsWith("@/core/") && !isExactPublicEntrypoint(specifier, "@/core/contracts")) {
      return "plugins may import only the public core contracts entrypoint";
    }
    if (specifier.startsWith("@/features/") && !/^@\/features\/[^/]+$/.test(specifier)) {
      return "plugins must not import feature internals";
    }
  }

  if (layer === "plugin-sdk") {
    if (specifier.startsWith("@/pages/") || specifier.startsWith("@tauri-apps/")) {
      return "plugin-sdk must not import pages or Tauri internals";
    }
    if (specifier.startsWith("@/core/") && !isExactPublicEntrypoint(specifier, "@/core/contracts")) {
      return "plugin-sdk must not import core repositories";
    }
  }

  if (layer === "feature" && specifier.startsWith("@/features/")) {
    const importerFeature = featureName(importer);
    const target = /^@\/features\/([^/]+)(?:\/(.+))?$/.exec(specifier);
    if (target && target[1] !== importerFeature && target[2]) {
      return "features must not import another feature's internals";
    }
  }

  return null;
}

export function findImportBoundaryViolations(modules: SourceModule[]): ImportBoundaryViolation[] {
  const violations: ImportBoundaryViolation[] = [];
  for (const module of modules) {
    for (const match of module.source.matchAll(importPattern)) {
      const specifier = match[1] ?? match[2];
      if (!specifier) continue;
      const message = boundaryMessage(module.path, specifier);
      if (message) violations.push({ importer: module.path, specifier, message });
    }
  }
  return violations.sort((left, right) =>
    `${left.importer}:${left.specifier}`.localeCompare(`${right.importer}:${right.specifier}`)
  );
}

function walkSourceFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkSourceFiles(fullPath);
    if (!sourceExtensions.test(entry.name) || testFile.test(entry.name)) return [];
    return [fullPath];
  });
}

function productionBoundaryModules(): SourceModule[] {
  return ["core", "features", "plugins", "plugin-sdk"].flatMap((root) =>
    walkSourceFiles(path.join(sourceRoot, root)).map((filePath) => ({
      path: path.relative(repoRoot, filePath),
      source: fs.readFileSync(filePath, "utf8"),
    }))
  );
}

describe("Mono frontend import boundaries", () => {
  it("keeps production ownership roots free of forbidden imports", () => {
    expect(findImportBoundaryViolations(productionBoundaryModules())).toEqual([]);
  });

  it("rejects forbidden ownership imports", () => {
    const violations = findImportBoundaryViolations([
      { path: "src/core/reader/controller.ts", source: 'import "@/plugins/library-ask/internal";' },
      { path: "src/plugins/example/index.ts", source: 'import "@/core/library/repository";' },
      { path: "src/plugins/example/index.ts", source: 'import "@/features/reader/internal";' },
      { path: "src/plugin-sdk/contracts.ts", source: 'import "@/pages/ReaderPage";' },
      { path: "src/plugin-sdk/contracts.ts", source: 'import "@tauri-apps/api/core";' },
      { path: "src/plugin-sdk/contracts.ts", source: 'import "@/core/library/repository";' },
      { path: "src/features/library/view.ts", source: 'import "@/features/reader/internal";' },
    ]);

    expect(violations).toEqual([
      {
        importer: "src/core/reader/controller.ts",
        specifier: "@/plugins/library-ask/internal",
        message: "core must not import plugin implementations",
      },
      {
        importer: "src/features/library/view.ts",
        specifier: "@/features/reader/internal",
        message: "features must not import another feature's internals",
      },
      {
        importer: "src/plugin-sdk/contracts.ts",
        specifier: "@/core/library/repository",
        message: "plugin-sdk must not import core repositories",
      },
      {
        importer: "src/plugin-sdk/contracts.ts",
        specifier: "@/pages/ReaderPage",
        message: "plugin-sdk must not import pages or Tauri internals",
      },
      {
        importer: "src/plugin-sdk/contracts.ts",
        specifier: "@tauri-apps/api/core",
        message: "plugin-sdk must not import pages or Tauri internals",
      },
      {
        importer: "src/plugins/example/index.ts",
        specifier: "@/core/library/repository",
        message: "plugins may import only the public core contracts entrypoint",
      },
      {
        importer: "src/plugins/example/index.ts",
        specifier: "@/features/reader/internal",
        message: "plugins must not import feature internals",
      },
    ]);
  });

  it("allows declared public entrypoints and a feature's own internals", () => {
    expect(findImportBoundaryViolations([
      { path: "src/plugins/example/index.ts", source: 'import type { DomainRefV1 } from "@/core/contracts";' },
      { path: "src/plugins/example/index.ts", source: 'import type { PluginManifestV1 } from "@/plugin-sdk";' },
      { path: "src/plugin-sdk/contracts.ts", source: 'export type { DomainRefV1 } from "@/core/contracts";' },
      { path: "src/features/library/view.ts", source: 'import "@/features/library/internal";' },
      { path: "src/features/library/view.ts", source: 'import "@/features/reader";' },
    ])).toEqual([]);
  });
});
