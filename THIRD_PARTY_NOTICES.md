# Third-party notices

LitFolio bundles [EasyRead](https://github.com/Edwardxlai/easyread) v1.5.0 (`a08c0d2`) as the implementation of overlapping paper-reading and library workflows. The upstream source and its included vendor notices are in `vendor/core/`. LitFolio's Tauri integration and exclusive features extend that implementation. The reading core is packaged as a frozen executable that embeds its own Python runtime and the components listed below.

## EasyRead

MIT License

Copyright (c) 2026 LiangXiLin

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Components inside the frozen LitFolio service

The build installs `vendor/core` and its declared dependencies, then freezes them with PyInstaller. Each package keeps its own licence text inside the executable. The list below records the projects and their licences.

| Component | Licence |
| --- | --- |
| CPython runtime | PSF-2.0 |
| PyInstaller bootloader | GPL-2.0-or-later with the Bootloader Exception, which permits distributing bundled applications under any licence |
| pypdfium2 and the PDFium build it ships | BSD-3-Clause, Apache-2.0 and the bundled third-party notices shipped in its wheel |
| pdfplumber | MIT |
| pdfminer.six | MIT |
| pypdf | BSD-3-Clause |
| Pillow | MIT-CMU, with the bundled libavif, libjpeg-turbo, libwebp and related notices shipped in its wheel |
| beautifulsoup4 | MIT |
| soupsieve | MIT |
| charset-normalizer | MIT |
| typing_extensions | PSF-2.0 |
| truststore | MIT |
| cryptography | Apache-2.0 OR BSD-3-Clause |
| certifi | MPL-2.0 |
