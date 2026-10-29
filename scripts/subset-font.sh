#!/usr/bin/env bash
# One-time: download Source Serif 4 (SIL OFL), instance wght 400-600 (opsz kept),
# subset to Latin basic + a few typographic marks, write WOFF2. Output is committed.
# Not a build step: the site never runs this.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VER="4.005R"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"   # downloads are untrusted: fresh empty dir, python3 -I, paths as arguments
curl -fsSL -o ss.zip "https://github.com/adobe-fonts/source-serif/releases/download/${VER}/source-serif-${VER%R}_Desktop.zip"
mkdir x && unzip -q ss.zip -d x
SRC="$(find "$WORK/x" -name 'SourceSerif4Variable-Roman.ttf' | head -1)"
LIC="$(find "$WORK/x" -name 'LICENSE.md' | head -1)"
python3 -I -m fontTools.varLib.instancer "$SRC" wght=400:600 -o "$WORK/ss4.ttf"
python3 -I -m fontTools.subset "$WORK/ss4.ttf" \
  --unicodes="U+0020-007E,U+00A0,U+00A9,U+00B7,U+2013,U+2014,U+2019,U+201C,U+201D,U+2026,U+2192" \
  --layout-features="kern,liga" --flavor=woff2 \
  --output-file="$ROOT/assets/fonts/source-serif-4.woff2"
cp "$LIC" "$ROOT/assets/fonts/OFL.txt"
SIZE=$(stat -c %s "$ROOT/assets/fonts/source-serif-4.woff2")
echo "source-serif-4.woff2: $SIZE bytes"
[ "$SIZE" -le 61440 ] || { echo "font over 60 KB budget" >&2; exit 1; }
