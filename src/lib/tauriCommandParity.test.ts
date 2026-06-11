import { describe, expect, it } from "vitest";

declare const __dirname: string;
declare function require(moduleName: string): unknown;

interface DirentLike {
  isDirectory(): boolean;
  name: string;
}

interface FsLike {
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

const repoRoot = path.resolve(__dirname, "../..");
const frontendRoot = path.join(repoRoot, "src");
const backendCommandRegistry = path.join(
  repoRoot,
  "src-tauri/src/commands/mod.rs"
);

function walkSourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "test") {
        return [];
      }
      return walkSourceFiles(fullPath);
    }
    if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) {
      return [];
    }
    return [fullPath];
  });
}

function backendCommandNames(): Set<string> {
  const source = fs.readFileSync(backendCommandRegistry, "utf8");
  const registeredCommands = source.matchAll(/commands(?:::[a-zA-Z0-9_]+)+/g);
  const names = new Set<string>();
  for (const match of registeredCommands) {
    const commandPath = match[0].split("::");
    const name = commandPath.at(-1);
    if (name && name !== "command_handlers") {
      names.add(name);
    }
  }
  if (names.size === 0) {
    throw new Error("tauri command_handlers registry paths not found");
  }
  return names;
}

function frontendInvokeCommands(): Map<string, string[]> {
  const commands = new Map<string, string[]>();
  for (const filePath of walkSourceFiles(frontendRoot)) {
    const source = fs.readFileSync(filePath, "utf8");
    for (const match of source.matchAll(
      /invoke(?:<[^>]*>)?\(\s*["`]([a-zA-Z0-9_]+)["`]/g
    )) {
      const name = match[1];
      const locations = commands.get(name) ?? [];
      locations.push(path.relative(repoRoot, filePath));
      commands.set(name, locations);
    }
  }
  return commands;
}

describe("Tauri command parity", () => {
  it("keeps frontend invoke strings registered in Rust", () => {
    const backend = backendCommandNames();
    const frontend = frontendInvokeCommands();
    const missing = [...frontend.entries()]
      .filter(([name]) => !backend.has(name))
      .map(([name, files]) => `${name} (${[...new Set(files)].join(", ")})`)
      .sort();

    expect(missing).toEqual([]);
  });
});
