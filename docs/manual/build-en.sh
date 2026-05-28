#!/bin/bash
cd "$(dirname "$0")"
echo "" | xelatex -interaction=nonstopmode manual-en.tex
echo "" | xelatex -interaction=nonstopmode manual-en.tex
echo "Done. Output: $(dirname "$0")/manual-en.pdf"
