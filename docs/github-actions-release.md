# GitHub Actions Release Packaging Guide

This project uses Tauri 2, pnpm, Vite, React, and Rust. Build each desktop
platform on its native GitHub Actions runner whenever possible:

- Linux packages: `ubuntu-latest`
- Windows packages: `windows-latest`
- macOS packages: `macos-latest`

Native runners avoid most cross-compilation issues around WebView, installer
toolchains, AppImage tools, and platform signing.

## Why The Local Linux Build Failed

The local build reached the packaging phase successfully:

- Rust release binary was built.
- Debian package was bundled.
- RPM package was bundled.
- AppImage packaging started.

The failure happened at:

```text
failed to bundle project `failed to run linuxdeploy`
```

`src-tauri/tauri.conf.json` currently has:

```json
"bundle": {
  "active": true,
  "targets": "all"
}
```

On Linux, `targets: "all"` asks Tauri to build every Linux bundle it supports,
including AppImage. AppImage bundling depends on the `linuxdeploy` toolchain and
its runtime requirements. If that toolchain is missing or cannot run in the
current environment, the whole `tauri build` command exits with code 1 even
though the `deb` and `rpm` outputs were already produced.

For local Linux builds, build only the package type you need:

```bash
pnpm tauri build --bundles deb
pnpm tauri build --bundles rpm
pnpm tauri build --bundles appimage
```

For CI releases, let GitHub Actions install the Linux dependencies and upload
the generated artifacts.

## Recommended Workflow

Create this file:

```text
.github/workflows/release.yml
```

Use this workflow as a starting point:

```yaml
name: Release

on:
  workflow_dispatch:
  push:
    tags:
      - "v*"

permissions:
  contents: write

jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: ubuntu-latest
            args: "--bundles deb,rpm,appimage"
          - platform: windows-latest
            args: "--bundles nsis,msi"

    runs-on: ${{ matrix.platform }}

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Install Linux dependencies
        if: matrix.platform == 'ubuntu-latest'
        run: |
          sudo apt-get update
          sudo apt-get install -y \
            libwebkit2gtk-4.1-dev \
            libappindicator3-dev \
            librsvg2-dev \
            patchelf \
            build-essential \
            curl \
            wget \
            file \
            libssl-dev

      - name: Install frontend dependencies
        run: pnpm install --frozen-lockfile

      - name: Build Tauri app
        run: pnpm tauri build ${{ matrix.args }}

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: litera-${{ matrix.platform }}
          path: |
            src-tauri/target/release/bundle/**/*.deb
            src-tauri/target/release/bundle/**/*.rpm
            src-tauri/target/release/bundle/**/*.AppImage
            src-tauri/target/release/bundle/**/*.msi
            src-tauri/target/release/bundle/**/*.exe
          if-no-files-found: error
```

## Windows Output

The Windows job runs on `windows-latest` and builds:

- NSIS installer: usually `.exe`
- MSI installer: `.msi`

The output files are uploaded as GitHub Actions artifacts. On a tag push such as
`v0.1.0`, the workflow will run automatically. It can also be started manually
from the Actions tab because `workflow_dispatch` is enabled.

## Optional GitHub Release Upload

The workflow above uploads build artifacts to the workflow run. If you also want
tag builds to create a GitHub Release, replace the final upload step with the
official Tauri release action later:

```yaml
      - name: Build and publish Tauri release
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: "Litera ${{ github.ref_name }}"
          releaseBody: "See the attached installers."
          releaseDraft: true
          prerelease: false
          args: ${{ matrix.args }}
```

Use the artifact-only workflow first. It is easier to debug because packaging
and release publishing are separate concerns.

## Local Verification Before Pushing

Run the same checks locally before creating a tag:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm tauri build --bundles deb
```

For Windows packages, rely on the `windows-latest` GitHub runner unless you are
already developing on Windows.

