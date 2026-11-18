import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Produces the frozen EasyRead service that Tauri ships through `externalBin`.
// The onefile artifact embeds the CPython runtime, so an installed LitFolio never
// needs a system Python.
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const upstream = join(root, "vendor", "easyread");
const host = run("rustc", ["-vV"], root).split("\n").find((line) => line.startsWith("host: ")).slice(6).trim();
const target = process.env.TAURI_ENV_TARGET_TRIPLE ?? host;
const windows = target.includes("windows");
const suffix = windows ? ".exe" : "";
const python = process.env.PYTHON ?? (process.platform === "win32" ? "python" : "python3");
const dest = join(root, "src-tauri", "binaries", `easyread-backend-${target}${suffix}`);
const force = process.argv.includes("--force") || process.env.EASYREAD_SIDECAR_FORCE === "1";

if (target !== host) {
  throw new Error(
    `EasyRead sidecar must be built on its target platform (target ${target}, host ${host}): ` +
      "PyInstaller cannot cross-build a frozen interpreter.",
  );
}

// Rebuild when any vendored input changed. Modification times keep the common case free of hashing.
const newestInput = newestMtime(upstream);
if (!force && existsSync(dest) && statSync(dest).mtimeMs >= newestInput) {
  makeExecutable(dest);
  console.log(`EasyRead sidecar is up to date: ${dest} (rebuild with --force)`);
} else {
  // Reuse EasyRead's own build definition; Tauri supplies the sidecar name.
  // PYTHONPATH puts the vendored tree ahead of any installed copy, so the artifact
  // always contains the sources this repository ships.
  run(python, ["scripts/build_backend.py"], upstream, { PYTHON: python, PYTHONPATH: upstream });
  const source = join(upstream, "build", "backend", `easyread-backend${suffix}`);
  if (!existsSync(source)) throw new Error(`EasyRead backend is missing: ${source}`);
  mkdirSync(join(root, "src-tauri", "binaries"), { recursive: true });
  // Replace the directory entry without overwriting an executable a dev session is using.
  const pending = `${dest}.pending`;
  copyFileSync(source, pending);
  makeExecutable(pending);
  renameSync(pending, dest);
  // Start the artifact on its build platform so a broken bundle fails here, not for users.
  run(dest, ["--help"], root);
  console.log(`EasyRead sidecar: ${source} -> ${dest}`);
}

function makeExecutable(path) {
  if (!windows) chmodSync(path, 0o755);
}

// Newest modification time among the vendored files that end up inside the artifact.
function newestMtime(directory) {
  const excluded = new Set([
    join(upstream, "build"),
    join(upstream, ".venv"),
    join(upstream, "node_modules"),
  ]);
  const pending = [directory];
  let newest = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        if (!excluded.has(path) && !entry.name.endsWith(".egg-info")) pending.push(path);
        continue;
      }
      if (path.endsWith(".pyc") || path.endsWith(".pyo")) continue;
      const { mtimeMs } = statSync(path);
      if (mtimeMs > newest) newest = mtimeMs;
    }
  }
  return newest;
}

function run(program, args, cwd, environment = {}) {
  const result = spawnSync(program, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    env: { ...process.env, ...environment },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${program} ${args.join(" ")} exited ${result.status}`);
  return result.stdout;
}
