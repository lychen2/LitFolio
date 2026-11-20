"""Install the reading runtime inputs into a Tauri-generated Android project."""

import base64
import csv
import hashlib
import io
import json
from pathlib import Path
import os
import shutil
import subprocess
import tarfile
from urllib.request import urlopen
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
CORE = ROOT / "vendor/core"
PROJECT = ROOT / "src-tauri/gen/android"
APP = PROJECT / "app"
ARM_WHEEL = "pypdfium2-5.14.0-py3-none-android_23_arm64_v8a.whl"
ARM_WHEEL_URL = (
    "https://files.pythonhosted.org/packages/91/03/"
    "79e89eac9d811e83d606342e129f5f39e168442ddf23b024fea4a7ee4762/" + ARM_WHEEL
)
ARM_WHEEL_SHA256 = "bed597b2cea3990164e43f9003f71db18959d0abd5d73adc9c176e7be2d84b98"
X64_PDFIUM_URL = (
    "https://github.com/bblanchon/pdfium-binaries/releases/download/"
    "chromium/8076/pdfium-android-x64.tgz"
)
X64_PDFIUM_SHA256 = "9d043689096c7cdd4ca98fff95599be115b2a38feba0c68d2a79ba5eedbda415"
PILLOW_VERSION = "11.0.0"
PILLOW_ANDROID_VERSION = f"{PILLOW_VERSION}+webp1"
PILLOW_SOURCE_URL = (
    "https://files.pythonhosted.org/packages/a5/26/"
    "0d95c04c868f6bdb0c447e3ee2de5564411845e36a858cfd63766bc7b563/"
    f"pillow-{PILLOW_VERSION}.tar.gz"
)
PILLOW_SOURCE_SHA256 = "72bacbaf24ac003fea9bff9837d1eedb6088758d41e100c1552930151f677739"
WEBP_VERSION = "1.6.0"
WEBP_SOURCE_URL = f"https://storage.googleapis.com/downloads.webmproject.org/releases/webp/libwebp-{WEBP_VERSION}.tar.gz"
WEBP_SOURCE_SHA256 = "e4ab7009bf0629fd11982d4c2aa83964cf244cffba7347ecd39019a9e38c4564"
# Chaquopy 17.2.0's Android CPython target, used for Python.h and libpython.
PYTHON_TARGET = "3.11.17-0"
ANDROID_INPUTS = {
    "arm64-v8a": (
        "c40b2d55a04720f60792769717c54442924dfb776d73a4312e9c2e7ae6aee3dc",
        "399b58d04898f2c7d5f0044e141bdf3818552e538e5f36d06d7fe0bebc298582",
    ),
    "x86_64": (
        "a27bfaa69ac5f1a0b583324696c9753ffabeeaa1047d3c8f2fb5e329c2b0beff",
        "a479a9c74ca9e900f30b6089ffd23a10d74fe7a9f427d967bceddf8f3fe206f1",
    ),
}


def write_if_changed(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists() or path.read_bytes() != content:
        path.write_bytes(content)


def insert_once(path, anchor, insertion):
    text = path.read_text(encoding="utf-8")
    if insertion in text:
        return
    if text.count(anchor) != 1:
        raise RuntimeError(f"Expected one {anchor!r} in {path}. Check the Tauri template.")
    write_if_changed(path, text.replace(anchor, anchor + insertion).encode("utf-8"))


def fetch(path, url, digest):
    if path.exists():
        with path.open("rb") as cached:
            if hashlib.file_digest(cached, "sha256").hexdigest() == digest:
                return
    with urlopen(url, timeout=60) as response:
        content = response.read()
    if hashlib.sha256(content).hexdigest() != digest:
        raise RuntimeError(f"SHA-256 mismatch for {url}")
    write_if_changed(path, content)


def repack_wheel(source, destination, dist_info, replacements, *, new_dist_info=None):
    record_path = f"{dist_info}/RECORD"
    output = io.BytesIO()
    record = io.StringIO(newline="")
    rows = csv.writer(record)
    with ZipFile(output, "w") as wheel:
        def add(name, content):
            wheel.writestr(ZipInfo(name), content, compress_type=ZIP_DEFLATED)
            digest = base64.urlsafe_b64encode(hashlib.sha256(content).digest()).decode().rstrip("=")
            rows.writerow((name, f"sha256={digest}", len(content)))

        for entry in source.infolist():
            name = entry.filename
            if name == record_path or entry.is_dir():
                continue
            content = replacements.pop(name) if name in replacements else source.read(entry)
            if new_dist_info and name.startswith(f"{dist_info}/"):
                name = new_dist_info + name[len(dist_info):]
            add(name, content)
        for name, content in replacements.items():
            add(name, content)
        record_path = f"{new_dist_info or dist_info}/RECORD"
        rows.writerow((record_path, "", ""))
        wheel.writestr(ZipInfo(record_path), record.getvalue(), compress_type=ZIP_DEFLATED)
    write_if_changed(destination, output.getvalue())


def android_x64_wheel(arm_wheel, x64_archive, destination):
    # The upstream Android arm64 wheel and Android x86_64 build use the same
    # PDFium revision, so they share Python bindings and build licenses.
    with ZipFile(arm_wheel) as arm, tarfile.open(x64_archive, "r:gz") as x64:
        native = x64.extractfile("lib/libpdfium.so").read()
        if native[:6] != b"\x7fELF\x02\x01" or native[18:20] != b"\x3e\x00":
            raise RuntimeError("Expected an x86_64 Android PDFium shared object")
        version = json.loads(arm.read("pypdfium2_raw/version.json"))
        if f"BUILD={version['build']}" not in x64.extractfile("VERSION").read().decode().splitlines():
            raise RuntimeError("Android PDFium builds and Python bindings must use the same revision")

        dist_info = "pypdfium2-5.14.0.dist-info"
        wheel_metadata = f"{dist_info}/WHEEL"
        repack_wheel(arm, destination, dist_info, {
            "pypdfium2_raw/libpdfium.so": native,
            wheel_metadata: arm.read(wheel_metadata).replace(b"android_23_arm64_v8a", b"android_23_x86_64"),
        })


def stage_pillow(wheels):
    # The Chaquopy wheel has JPEG, PNG and FreeType but omits Pillow's WebP extension.
    # Build that extension from the same Pillow source and link libwebp statically.
    ndk = os.environ.get("NDK_HOME") or os.environ.get("ANDROID_NDK_HOME")
    if not ndk:
        sdk = os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT")
        ndk = Path(sdk or Path.home() / "Android/Sdk") / "ndk/27.1.12297006"
    toolchain = Path(ndk).resolve() / "build/cmake/android.toolchain.cmake"
    if not toolchain.is_file():
        raise SystemExit(f"Set NDK_HOME to the Android NDK directory (missing {toolchain})")

    native_build = APP / "reading-native"
    pillow_source = native_build / f"pillow-{PILLOW_VERSION}"
    webp_source = native_build / f"libwebp-{WEBP_VERSION}"
    for source, url, digest in (
        (pillow_source, PILLOW_SOURCE_URL, PILLOW_SOURCE_SHA256),
        (webp_source, WEBP_SOURCE_URL, WEBP_SOURCE_SHA256),
    ):
        archive = source.with_suffix(source.suffix + ".tar.gz")
        fetch(archive, url, digest)
        with tarfile.open(archive) as contents:
            for member in contents.getmembers():
                if member.isfile():
                    write_if_changed(native_build / member.name, contents.extractfile(member).read())

    dist_info = f"pillow-{PILLOW_VERSION}.dist-info"
    for abi, (pillow_digest, target_digest) in ANDROID_INPUTS.items():
        abi_dir = native_build / abi
        platform = f"cp311-cp311-android_24_{abi.replace('-', '_')}"
        base = abi_dir / f"pillow-{PILLOW_VERSION}-0-{platform}.whl"
        fetch(base, f"https://chaquo.com/pypi-13.1/pillow/{base.name}", pillow_digest)
        target = abi_dir / f"target-{PYTHON_TARGET}-{abi}.zip"
        maven = "https://repo.maven.apache.org/maven2/com/chaquo/python/target"
        fetch(target, f"{maven}/{PYTHON_TARGET}/{target.name}", target_digest)
        with ZipFile(target) as contents:
            for name in contents.namelist():
                if (name.startswith("include/python3.11/") and not name.endswith("/")) or name == f"jniLibs/{abi}/libpython3.11.so":
                    write_if_changed(abi_dir / name, contents.read(name))

        build = abi_dir / "build"
        subprocess.run([
            "cmake", "-S", str(HERE / "webp"), "-B", str(build), "-G", "Ninja",
            f"-DCMAKE_TOOLCHAIN_FILE={toolchain}", f"-DANDROID_ABI={abi}",
            "-DANDROID_PLATFORM=android-24", "-DCMAKE_BUILD_TYPE=Release",
            "-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON",
            f"-DPILLOW_SOURCE={pillow_source}", f"-DWEBP_SOURCE={webp_source}",
            f"-DPYTHON_TARGET={abi_dir}",
        ], check=True)
        subprocess.run(["cmake", "--build", str(build), "--parallel", "4"], check=True)

        destination = wheels / f"pillow-{PILLOW_ANDROID_VERSION}-{platform}.whl"
        metadata = f"{dist_info}/METADATA"
        wheel_metadata = f"{dist_info}/WHEEL"
        new_dist_info = f"pillow-{PILLOW_ANDROID_VERSION}.dist-info"
        with ZipFile(base) as wheel:
            repack_wheel(wheel, destination, dist_info, {
                metadata: wheel.read(metadata).replace(
                    f"Version: {PILLOW_VERSION}\n".encode(), f"Version: {PILLOW_ANDROID_VERSION}\n".encode(), 1
                ),
                wheel_metadata: wheel.read(wheel_metadata).replace(b"Build: 0\n", b"", 1),
                "PIL/_webp.so": (build / "_webp.so").read_bytes(),
                f"{new_dist_info}/licenses/libwebp-LICENSE": (webp_source / "COPYING").read_bytes(),
                f"{new_dist_info}/licenses/libwebp-PATENTS": (webp_source / "PATENTS").read_bytes(),
            }, new_dist_info=new_dist_info)


def main():
    app_gradle = APP / "build.gradle.kts"
    if not app_gradle.is_file():
        raise SystemExit("Run pnpm tauri android init --ci --skip-targets-install first")
    entry = HERE / "python/litfolio_android.py"
    if not entry.is_file():
        raise SystemExit(f"Missing the reading core's Android entry point: {entry}")

    insert_once(
        PROJECT / "build.gradle.kts",
        "    dependencies {\n",
        '        classpath("com.chaquo.python:gradle:17.2.0")\n',
    )
    insert_once(app_gradle, '    id("rust")\n', '    id("com.chaquo.python")\n')
    insert_once(app_gradle, 'apply(from = "tauri.build.gradle.kts")', '\napply(from = "reading.gradle")')
    insert_once(
        PROJECT / "gradle.properties",
        "android.nonFinalResIds=false",
        "\nabiList=arm64-v8a,x86_64\narchList=arm64,x86_64\ntargetList=aarch64,x86_64\n",
    )
    insert_once(
        APP / "src/main/AndroidManifest.xml",
        '        android:label="@string/app_name"\n',
        '        android:networkSecurityConfig="@xml/reading_network_security"\n',
    )
    for source, destination in (
        ("ReadingPlugin.kt", "src/main/java/dev/litera/desktop/ReadingPlugin.kt"),
        ("reading.gradle", "reading.gradle"),
        ("requirements.txt", "reading-requirements.txt"),
        ("reading.pro", "reading.pro"),
        ("network_security.xml", "src/main/res/xml/reading_network_security.xml"),
        ("network_security_debug.xml", "src/debug/res/xml/reading_network_security.xml"),
    ):
        write_if_changed(APP / destination, (HERE / source).read_bytes())

    wheels = APP / "reading-wheels"
    arm = wheels / ARM_WHEEL
    x64 = wheels / "pdfium-android-x64-8076.tgz"
    fetch(arm, ARM_WHEEL_URL, ARM_WHEEL_SHA256)
    fetch(x64, X64_PDFIUM_URL, X64_PDFIUM_SHA256)
    android_x64_wheel(arm, x64, wheels / ARM_WHEEL.replace("arm64_v8a", "x86_64"))
    stage_pillow(wheels)

    # Stage only application inputs, excluding local wheel builds and caches.
    python = APP / "reading-python"
    if python.exists():
        shutil.rmtree(python)
    shutil.copytree(CORE / "core", python / "core", ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    shutil.copyfile(entry, python / entry.name)


if __name__ == "__main__":
    main()
