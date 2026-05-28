#!/bin/bash
cd "$(dirname "$0")"
echo "" | xelatex -interaction=nonstopmode manual.tex
echo "" | xelatex -interaction=nonstopmode manual.tex
echo "Done. Output: $(dirname "$0")/manual.pdf"
