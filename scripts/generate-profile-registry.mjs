/* global process, console */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const profile = process.env.VITE_LITFOLIO_PROFILE || "core";
const pluginRoot = join(root, "plugins");
const manifests = readdirSync(pluginRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => ({
    id: entry.name,
    value: JSON.parse(readFileSync(join(pluginRoot, entry.name, "manifest.json"), "utf8")),
  }))
  .sort((a, b) => a.id.localeCompare(b.id));
const selected = profile === "core"
  ? []
  : profile === "all"
    ? manifests
    : manifests.filter(({ id }) => profile.split(",").includes(id));

const imports = selected.map(({ id }) =>
  `import ${id.replaceAll("-", "_")} from "../../plugins/${id}/manifest.json";`
).join("\n");
const values = selected.map(({ id }) => id.replaceAll("-", "_")).join(",\n  ");
const loaders = selected.map(({ id }) =>
  `  ${JSON.stringify(id)}: () => import("@/plugins/${id}/index"),`
).join("\n");
const output = `${imports}\n\nimport type { FrontendPluginEntry } from "./pluginTypes";\n\nexport const selectedManifests = [${values}] as const;\nexport const selectedPluginLoaders: Record<string, () => Promise<FrontendPluginEntry>> = {\n${loaders}\n};\nexport const selectedProfile = ${JSON.stringify(profile)};\n`;

const target = join(root, "src/host/generatedProfileRegistry.ts");
mkdirSync(join(root, "src/host"), { recursive: true });
writeFileSync(target, output);
console.log(`Generated ${selected.length} plugin entries for profile ${profile}`);
