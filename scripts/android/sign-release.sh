#!/usr/bin/env bash
set -euo pipefail

: "${ANDROID_HOME:?Set ANDROID_HOME to the Android SDK}"
: "${ANDROID_SIGNING_KEYSTORE:?Set the Android upgrade keystore path}"
: "${ANDROID_SIGNING_STORE_PASSWORD:?Set the Android keystore password}"
: "${ANDROID_SIGNING_KEY_ALIAS:?Set the Android signing key alias}"
: "${ANDROID_SIGNING_KEY_PASSWORD:?Set the Android signing key password}"

build_tools="$ANDROID_HOME/build-tools/36.0.0"
output=src-tauri/gen/android/app/build/outputs/apk
# The public v0.5.2 APK established this certificate as the upgrade identity.
upgrade_cert=98138e017f4c4c72f913cfcaeedc631e9ab8fd593a6a7e857e174e01cbbb73c8

work_dir=$(mktemp -d "$output/signing.XXXXXX")
trap 'rm -f "$work_dir"/*.apk && rmdir "$work_dir"' EXIT

for flavor in arm64 x86_64; do
    apk="$output/$flavor/release/app-$flavor-release-unsigned.apk"
    case "$flavor" in
        arm64) abi=arm64-v8a ;;
        x86_64) abi=x86_64 ;;
    esac
    name="LitFolio-$abi-release.apk"
    "$build_tools/zipalign" -P 16 -f 4 "$apk" "$work_dir/aligned.apk"
    "$build_tools/apksigner" sign --v4-signing-enabled false \
        --ks "$ANDROID_SIGNING_KEYSTORE" --ks-key-alias "$ANDROID_SIGNING_KEY_ALIAS" \
        --ks-pass env:ANDROID_SIGNING_STORE_PASSWORD --key-pass env:ANDROID_SIGNING_KEY_PASSWORD \
        --out "$work_dir/$name" "$work_dir/aligned.apk"
    signer=$("$build_tools/apksigner" verify --print-certs "$work_dir/$name")
    if ! grep -Fxq "Signer #1 certificate SHA-256 digest: $upgrade_cert" <<< "$signer"; then
        echo "Signing certificate does not match the public Android APK" >&2
        exit 1
    fi
    "$build_tools/zipalign" -c -P 16 4 "$work_dir/$name"
done

mkdir -p "$output/signed"
mv "$work_dir"/LitFolio-*-release.apk "$output/signed/"
