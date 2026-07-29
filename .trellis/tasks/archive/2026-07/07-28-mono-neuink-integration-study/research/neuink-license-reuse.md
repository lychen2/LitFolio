# NeuInk licensing and dependency reuse audit

## Scope and limits

- Audited checkout: `/tmp/litfolio-neuink-audit`, commit `11b848e0cfe9100a0386bcf2d4f3b839148d3b99` (`main`). The checkout's `LICENSE` hash matches the same file fetched from that commit on GitHub (`sha256: 844601fc418adb8902ae6c738823b563da97b9213b6af8b14a12e62683b17100`).
- Target: incorporation into LitFolio, represented in this workspace as GPL version 3 and described by the project as `GPL-3.0-or-later` (`/home/zonazcy/Projects/litera-desktop/LICENSE`, lines 1-6).
- The NeuInk clone is shallow: `git rev-parse --is-shallow-repository` returned `true`, `git rev-list --count --all` returned `1`, and the only visible author is `NeuInk <neuink@users.noreply.github.com>`. Commit `11b848e` has a parent object named in the commit, but that history is absent locally. Consequently, this audit cannot verify contributor ownership, earlier provenance, removed notices, or the origin of individual source/assets from history.
- This is an engineering compliance audit, not legal advice or a warranty of non-infringement. Package metadata and repository declarations are evidence, not conclusive title or license validation. Terms fetched from external sites can change and must be rechecked at the release date.

## Executive finding

NeuInk declares its own workspace code Apache-2.0: the Rust workspace manifest says `license = "Apache-2.0"`, identifies `Neuink` as author, and points to the GitHub repository (`/tmp/litfolio-neuink-audit/Cargo.toml`, lines 14-20); the repository contains the full Apache License 2.0 and a `NOTICE` naming "Copyright 2026 NeuInk contributors" (`LICENSE`, lines 1-5 and 189-201; `NOTICE`, lines 1-12). The FSF lists Apache-2.0 as compatible with GPLv3 ([GNU license list, Apache 2.0 entry](https://www.gnu.org/licenses/license-list.html#apache2)). That supports source reuse in a GPLv3-or-later combined LitFolio work, provided the Apache conditions and all upstream third-party conditions are also satisfied. It does not establish ownership of every file or grant NeuInk trademark rights.

The lowest-risk path is idea-level reimplementation with LitFolio-native code and branding. Directly copied or adapted NeuInk source is feasible from the declared-license perspective but requires file-level modification notices, preservation of relevant attribution and the NeuInk `NOTICE`, a copy of Apache-2.0, exact provenance records, and GPL corresponding-source compliance for distributed LitFolio builds. Do not copy NeuInk logos, app icons, screenshots, or product identity without separate trademark/asset clearance.

NeuInk does not contain model weights at this commit and states that MinerU and LLM services are external. Do not infer permission to bundle a model, MinerU, or any provider runtime from NeuInk's Apache license. Each such artifact or service needs its own version-pinned review.

## Reuse classification

| Reuse path | What it means | Result and conditions |
| --- | --- | --- |
| Idea-level clean reimplementation | Use observable concepts, workflows, behavior, or public interfaces, but write new code, tests, copy, assets, and schemas without translating NeuInk source expression. | Preferred. Copyright generally does not protect abstract ideas or functionality, but this is not a categorical clearance for UI expression, documentation text, patents, trade dress, or trademarks. Keep a written functional specification and implementation provenance. Avoid copying identifiers, comments, prompts, UI text, fixtures, screenshots, and distinctive visual composition unless separately reviewed. No NeuInk Apache redistribution artifact is ordinarily created by independent implementation, but common third-party dependencies still need LitFolio's own audit. |
| Adapted/copied NeuInk source | Copy, translate, or modify NeuInk TypeScript, Rust, CSS, configuration, tests, prompts, or documentation. | Treat it as Apache-2.0 material incorporated into LitFolio. Distribute the combined work under GPL-3.0-or-later while preserving NeuInk's applicable Apache conditions. Record source path and commit; retain relevant notices; include Apache-2.0; reproduce applicable `NOTICE` content; and place prominent change notices with dates in every modified NeuInk-derived file. Apache's patent grant and patent-termination terms continue to matter. |
| Generated/copied UI components | NeuInk has `components.json` configured for shadcn's `radix-nova` style and Lucide (`apps/desktop/components.json`, lines 1-22); it contains many `src/components/ui/*.tsx` files with no source headers. | Do not assume NeuInk authored those files merely because its top-level license says Apache-2.0. shadcn upstream is MIT ([shadcn license](https://github.com/shadcn-ui/ui/blob/main/LICENSE.md)); Radix and Lucide have their own licenses. If copying those files from NeuInk, preserve both NeuInk provenance where NeuInk changes are substantial and the underlying MIT/other notices. Prefer regenerating equivalent components from the current upstream registry and record that upstream version. |
| Shared third-party dependency only | LitFolio independently selects the same npm crate, Cargo crate, or library API. | This is dependency reuse, not necessarily NeuInk source reuse. Pin and audit the exact LitFolio-resolved version and shipped files. Do not copy NeuInk's incomplete dependency summary as the release notice. |
| Bundled NeuInk assets | Copy NeuInk logos, icons, screenshots, sample documents, or other media. | Avoid by default. The repository has many NeuInk-branded SVG/PNG/ICO/ICNS files and screenshots but no separate asset-license or trademark permission found. Apache-2.0 section 6 expressly does not grant permission to use licensor trade names, trademarks, service marks, or product names except reasonable origin description and NOTICE reproduction (`LICENSE`, lines 138-141). Use LitFolio branding and screenshots instead. |
| Bundled models or service software | Ship E5 weights/tokenizer, MinerU, an LLM, Ollama, or another provider runtime/model. | Not licensed by NeuInk's Apache grant merely because NeuInk can call it. Conduct a separate artifact-level review, preserve model/runtime notices, pin hashes/revisions, and check commercial/use restrictions. MinerU source is a special incompatibility concern discussed below. |
| External API/service integration | Let users configure MinerU Cloud, Qiniu, OpenAI-compatible providers, or a custom endpoint. | Usually no third-party software is incorporated solely by making network requests, but the applicable API/service contract, privacy/data terms, branding rules, and acceptable-use policies still govern. Add provider-specific disclosures and links; do not represent API compatibility as endorsement. |

## NeuInk's Apache-2.0 obligations

For any NeuInk source or other copyrightable Apache-covered material that LitFolio distributes:

1. Give recipients a copy of Apache License 2.0 (NeuInk `LICENSE`, lines 89-96). Keep LitFolio's GPL-3.0-or-later license for the combined covered work; Apache-2.0 compatibility does not permit removing the Apache terms and provenance from the NeuInk portions.
2. Add prominent notices to every modified NeuInk-derived file stating that LitFolio changed it (`LICENSE`, lines 97-98). Include a relevant modification date to align with GPLv3 section 5(a) as well ([GPLv3 section 5](https://www.gnu.org/licenses/gpl-3.0.html#section5)).
3. Retain pertinent copyright, patent, trademark, and attribution notices from NeuInk source (`LICENSE`, lines 100-104). The absence of per-file headers in this snapshot does not justify removing the top-level copyright/NOTICE.
4. Reproduce the applicable attribution notices from NeuInk's `NOTICE` in a distributed `NOTICE`, bundled documentation, or customary legal-notices UI (`LICENSE`, lines 106-121). At minimum, preserve `NeuInk` and `Copyright 2026 NeuInk contributors` for reused NeuInk material. Clearly identify LitFolio modifications and do not imply NeuInk endorsement.
5. Preserve the Apache patent grant/termination context. NeuInk's license grants contributor patent rights for necessarily infringed contribution claims and terminates those patent rights for specified patent litigation (`LICENSE`, lines 73-87).
6. Satisfy GPLv3 distribution duties independently, including licensing the combined covered work under GPLv3-or-later and offering complete corresponding source for conveyed object code ([GPLv3 sections 5-6](https://www.gnu.org/licenses/gpl-3.0.html#section6)). This includes build scripts and interface definition files required by the GPL definition, subject to its exclusions.

Recommended source-file notice for an actually adapted file, subject to maintainer/legal review:

```text
Portions derived from NeuInk commit 11b848e0cfe9100a0386bcf2d4f3b839148d3b99,
Copyright 2026 NeuInk contributors, licensed under Apache-2.0.
Modified by LitFolio contributors on YYYY-MM-DD.
```

Do not add that notice to independently written files merely because they implement a similar feature; doing so would create inaccurate provenance.

## Dependency and bundled-artifact findings

### npm/frontend

The frontend manifest has direct runtime dependencies including PDF.js, Geist, shadcn, TipTap, KaTeX, Mermaid, assistant-ui, the Vercel AI SDK, Radix, and Lucide (`apps/desktop/package.json`, lines 17-68). The lockfile resolved 937 external `node_modules` package entries in this audit. Lockfile metadata was overwhelmingly permissive, but it is not all MIT/Apache:

- `@fontsource-variable/geist@5.2.9` declares OFL-1.1 and is imported by the production global stylesheet (`apps/desktop/src/styles/globals.css`, lines 1-5). Its `.woff2` files are therefore expected in the built UI. The release must retain the Geist copyright and full OFL-1.1 text; modified font files have OFL reserved-name constraints. Upstream license evidence: [Geist license](https://github.com/vercel/geist-font/blob/main/LICENSE.txt).
- `pdfjs-dist@6.0.227` is Apache-2.0, but NeuInk's Vite plugin explicitly copies `wasm`, `iccs`, `cmaps`, and `standard_fonts` from the package into the production output (`apps/desktop/vite/pdfJsAssetsPlugin.ts`, lines 7-9 and 47-57). The npm tarball contains nested licenses for Adobe CMaps, Foxit/PDFium fonts, Liberation fonts (OFL-1.1), JBIG2/OpenJPEG/QCMS WASM, and PDF.js itself. Copy all pertinent nested license files into LitFolio notices if this mechanism or those assets are reused; a single "PDF.js - Apache-2.0" row is insufficient.
- Resolved npm metadata also includes MPL-2.0 packages (`lightningcss` platform packages), `dompurify` under `(MPL-2.0 OR Apache-2.0)`, Unicode/CC-BY-related data such as `caniuse-lite` (CC-BY-4.0), and other permissive variants. Many are build-only and may not be conveyed, so obligations must be based on the actual installer contents and source distribution rather than every lock entry indiscriminately.
- `khroma@2.1.0` has no `license` field in the lock/package metadata, but its published tarball contains an MIT `package/license` naming Fabio Spampinato and Andrew Maney. This is a tooling red flag for automated scanners: missing metadata requires package-content inspection and retention of the actual license.
- shadcn-generated source is MIT upstream and warrants a copied-source notice even though the generator package is just a dependency. Lucide lock metadata declares ISC, while the NeuInk README omits it from the dependency summary.

No npm lock metadata entry declared GPL, AGPL, or SSPL in this snapshot. That is not a final binary clearance: minified bundles, copied package assets, optional platform packages, and package `NOTICE` files still need an artifact scan.

### Cargo/native

NeuInk's own Rust crates inherit Apache-2.0 from the workspace. Direct dependencies include Tauri, FastEmbed, Reqwest, Tokio, Rayon, Serde, `zip`, cryptographic helpers, and Tauri plugins (`Cargo.toml`, lines 21-40; `crates/neuink-search/Cargo.toml`, lines 8-18). `cargo metadata --locked` resolved hundreds of target-specific transitive crates and reported, among others:

- MPL-2.0 crates (`cssparser`, `cssparser-macros`, `dtoa-short`, `option-ext`, `selectors`). MPL is file-level copyleft; if any MPL source is modified or conveyed in a form triggering source availability, preserve MPL notices and provide the covered source as required. Verify the exact platform artifact and whether an "Incompatible With Secondary Licenses" notice exists before relying on GPL secondary-license compatibility.
- Unicode-3.0 ICU data/code crates, CDLA-Permissive-2.0 web PKI roots, BSD/ISC/Zlib/NCSA components, and several multi-license expressions. Record the selected license branch for each `OR` expression in the generated notice set.
- `fastembed@5.17.2`, `ort`, `ort-sys`, and `tokenizers` are present because desktop defaults enable `local-embedding` (`apps/desktop/src-tauri/Cargo.toml`, lines 23-25). Native ONNX Runtime packaging can add binary and third-party-notice obligations not visible from Cargo's top-level license field; inspect the actual target bundle and build/download behavior.
- Tauri's platform stack can dynamically use system WebView/GTK libraries with licenses outside Cargo package metadata. Treat those through the selected target's Tauri distribution guidance and installer inventory.

No Cargo metadata package declared GPL or AGPL as its sole license in this resolution. Two `r-efi` versions offered `MIT OR Apache-2.0 OR LGPL-2.1-or-later`; select and document a permissive branch. This metadata-level result is not a substitute for scanning vendored/native binaries, generated bindings, and notices in the release artifact.

### NeuInk visual and documentation assets

- NeuInk bundles a complete named logo pack and recommends app-icon/product-icon/favicon uses (`apps/desktop/src-tauri/logo_assets/README.txt`, lines 1-16). The Tauri configuration uses NeuInk product name, identifier, title, and icons (`apps/desktop/src-tauri/tauri.conf.json`, lines 1-18 and 48-61).
- No standalone copyright/license metadata was found inside the SVGs, PNGs, screenshots, `asset_manifest.json`, or logo README. The top-level Apache declaration may cover copyright in repository assets, but Apache section 6 withholds trademark permission. The shallow history cannot establish who designed them. Do not import these into LitFolio branding.
- README screenshots are copyrightable product media. Use them only as internal audit evidence or with explicit permission/clear Apache attribution after confirming no third-party content appears in them. Do not ship them as LitFolio marketing or documentation assets by default.

## Models

### `intfloat/multilingual-e5-small`

- No model weights are in the audited checkout. `.gitignore` excludes everything under the default model directory except a placeholder README (`.gitignore`, lines 69-74); the placeholder lists expected ONNX/tokenizer files (`apps/desktop/src-tauri/resources/embedding-models/default/README.md`, lines 1-26).
- NeuInk states the model is optional, large, not silently downloaded, and MIT-licensed (`README_EN.md`, lines 91-95 and 172-186). The local provider reads user-supplied ONNX and tokenizer files and uses FastEmbed's user-defined model API (`crates/neuink-search/src/fastembed_provider.rs`, lines 16-20 and 108-126).
- The Hugging Face model card currently declares `license: mit`, and the API returned model revision `614241f622f53c4eeff9890bdc4f31cfecc418b3` ([model card](https://huggingface.co/intfloat/multilingual-e5-small), [model API](https://huggingface.co/api/models/intfloat/multilingual-e5-small)). A direct `LICENSE` file was not present at the probed URL; therefore, preserve the exact model card/revision and do not rely on an unversioned "MIT" label alone.
- If LitFolio bundles it, record each file hash and source revision, include the model card and applicable MIT attribution, verify the ONNX conversion/tokenizer provenance and any base-model/data terms, document model limitations, and ensure the build cannot accidentally include a different ignored local model. Keep model artifacts under their own license rather than labeling weights GPL.

### LLM and Ollama-listed models

NeuInk ships no LLM weights. It lists model names for Ollama and hosted providers, including Qwen, Llama, Gemma, DeepSeek, OpenAI, Anthropic, Google, Mistral, Kimi, Doubao, GLM, Hunyuan, and MiniMax (`apps/desktop/src/modules/settings/components/providerPresets.ts`, lines 23-412). Model names are not license grants. If LitFolio downloads or bundles any local model, audit that exact model/tag/weight revision because licenses can differ within a provider family. For hosted models, the provider's API terms and model-specific policies govern the user's calls.

## External services and terms

### MinerU and Qiniu

- NeuInk defaults to `https://mineru.net/api/v4` and requires a user token (`.env.example`, lines 4-14; `crates/neuink-parser/src/cloud_mineru.rs`, lines 25-30 and 301-318). Its fallback uploads the PDF to a user-configured Qiniu bucket and gives MinerU a public URL (`.env.example`, lines 16-23; `cloud_mineru.rs`, lines 94-120). This is a material document-data transfer that needs explicit privacy disclosure and links to both services' current terms/data-retention policies.
- NeuInk explicitly calls MinerU "optional external parsing" and tells users to review cloud terms/data handling themselves (`README_EN.md`, lines 85-95). No copy of MinerU Cloud or Qiniu service terms was found in the repository. The audit could not retrieve a terms page from the guessed `https://mineru.net/terms-of-service` URL, so no conclusion about API redistribution, caching, training, retention, geography, or commercial rights is supported by this snapshot.
- API interoperability alone does not copy MinerU source. If LitFolio instead bundles or operates MinerU source, current upstream `master` uses a custom "MinerU Open Source License" layered on Apache-2.0 with commercial thresholds (100 million MAU or USD 20 million monthly revenue), mandatory attribution for third-party online services, and automatic termination language ([current MinerU license](https://github.com/opendatalab/MinerU/blob/master/LICENSE.md)). Those additional restrictions are not plain Apache-2.0 and may conflict with GPLv3's no-further-restrictions rule. Stop before bundling/linking/distributing MinerU source and obtain a version-pinned compatibility review or separate license. Current upstream terms are not evidence of the license applicable to every historical MinerU release or to MinerU Cloud's API contract.

### LLM/provider services

- Built-in endpoints include DeepSeek, OpenAI, OpenRouter, Moonshot, Volcengine Ark, DashScope, Zhipu, Tencent Hunyuan, and MiniMax, plus local Ollama (`providerPresets.ts`, lines 23-412). A private "Popo enhancement" endpoint can also be configured, but the repository provides no operator, license, or terms information (`.env.example`, lines 25-29).
- NeuInk's README says users configure their own LLM service and no LLM is shipped (`README_EN.md`, lines 87-95). That avoids weight redistribution, not provider-contract obligations. Before LitFolio offers a preset, link the current provider terms/privacy policy, identify what paper/note/context data leaves the device, disclose retention/training controls where known, and avoid promising compatibility with unverified future model IDs.
- Provider and model names are trademarks. Text-only initials/colors in NeuInk's preset list are not a general permission to reuse provider logos. Use names only as needed to describe compatibility and follow each provider's brand rules.

## Required compliance artifacts for LitFolio

1. **NeuInk provenance ledger:** for every copied/adapted file, record NeuInk repository URL, commit `11b848e...`, original path, LitFolio destination, reuse classification, author/copyright notice, modification date, and reviewer. Keep clean implementations in a separate list with their functional-spec origin.
2. **Distributed legal texts:** include LitFolio GPL-3.0-or-later, Apache-2.0, applicable NeuInk `NOTICE` attribution, and full licenses/notices for every dependency or asset actually conveyed. Preserve nested PDF.js asset licenses and OFL font texts rather than only package-level summaries.
3. **Source and change markers:** add prominent "modified" notices to each adapted NeuInk file; retain upstream notices; make complete corresponding source/build scripts available with every LitFolio binary distribution under GPLv3 section 6.
4. **Release SBOM and license report:** generate from exact locked npm/Cargo versions and exact target/features, then scan the produced installer/AppImage/DMG/MSI and unpacked frontend. Resolve missing/ambiguous metadata manually and archive the report with the release.
5. **Asset/model/service register:** record binary hashes, source revisions, license/model-card copies, trademarks/permissions, and provider ToS/privacy-policy review dates. Add user-facing disclosure and consent for PDF/note/context uploads to MinerU, Qiniu, and LLM endpoints.

## Red flags and stop conditions

- **History/provenance gap:** the one-commit shallow clone cannot prove authorship or reveal prior third-party notices. Before substantial source copying, obtain full history and inspect contributor identities, file origins, imported code, and asset creation. If full history or contributor authority cannot be established, prefer clean implementation.
- **NeuInk branding:** Apache-2.0 does not grant trademark rights. Stop any plan to reuse NeuInk name, logo, icons, identifier, screenshots, or lookalike product presentation until written permission/brand review exists.
- **Incomplete NeuInk dependency notice:** NeuInk's `NOTICE` calls its README table a summary and itself instructs release builders to generate full notices (`NOTICE`, lines 4-12; `README_EN.md`, lines 172-186). Do not ship that table as LitFolio's complete notice.
- **MinerU source license:** current additional commercial/attribution/termination terms may be a GPL incompatibility. API calls are a different legal relationship, but self-hosting or bundling MinerU must stop for a separate review.
- **Unpinned ignored model directory:** the Tauri bundle glob includes the default model directory (`tauri.conf.json`, lines 48-53) while Git ignores real files. A developer machine can therefore change the shipped legal artifact without a source diff. Require a hash-locked model-fetch/build manifest or keep weights out of the main bundle.
- **Copied generated UI and binary assets:** no per-file provenance markers were found for shadcn-derived UI, NeuInk logos, or screenshots. Recreate UI from known upstreams and replace branding unless full provenance is established.
- **Artifact-specific transitive terms:** PDF.js nested fonts/WASM/CMaps, Geist OFL files, native ONNX Runtime, MPL crates, system WebViews, and target-specific packages are not covered by a top-level MIT/Apache summary. A release is not ready until exact built artifacts pass a notice/source-offer review.

## Recommended integration rule

Use NeuInk as a behavioral reference first. For each candidate feature, choose one of two explicit tracks:

- **Clean track:** write a LitFolio functional spec from behavior, implement with LitFolio patterns without consulting/copying source during implementation, and record that provenance.
- **Reuse track:** only where copying materially reduces risk or effort, import narrowly from commit `11b848e...`, preserve the Apache/NOTICE chain, mark modifications, replace all NeuInk branding, and include the file in release notice/SBOM checks.

Do not mix the tracks without recording the boundary. The shallow-history, logo/trademark, MinerU-license, and incomplete-notice issues make undocumented broad copying the highest-risk option.
