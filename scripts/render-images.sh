#!/usr/bin/env bash
# One-time: render og.png, apple-touch-icon.png, icon-512.png with headless Chrome,
# then pack favicon.ico with Pillow. Outputs are committed; this is not a build step.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHROME="${CHROME:-google-chrome}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

shot() { # $1 html file, $2 width, $3 height, $4 output png
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --default-background-color=00000000 --allow-file-access-from-files \
    --window-size="$2,$3" --screenshot="$4" "file://$1" >/dev/null 2>&1
}

wrap() { # $1 svg markup, $2 size px, $3 out html
  printf '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent}svg{display:block;width:%spx;height:%spx}</style>%s' "$2" "$2" "$1" > "$3"
}

ICON="$(cat "$ROOT/favicon.svg")"
FULL_BLEED="${ICON/rx=\"6\" /}"

wrap "$FULL_BLEED" 180 "$TMP/touch.html"
shot "$TMP/touch.html" 180 180 "$ROOT/apple-touch-icon.png"

wrap "$ICON" 512 "$TMP/icon.html"
shot "$TMP/icon.html" 512 512 "$ROOT/icon-512.png"

cat > "$TMP/og.html" <<EOF
<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:"Source Serif 4";src:url("file://$ROOT/assets/fonts/source-serif-4.woff2") format("woff2");font-weight:400 600}
html,body{margin:0}svg{display:block}
</style>
$(cat "$ROOT/assets/img/og.svg")
EOF
shot "$TMP/og.html" 1200 630 "$ROOT/assets/img/og.png"

python3 -I - "$ROOT/icon-512.png" "$ROOT/favicon.ico" <<'PY'
import sys
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
Image.open(src).convert("RGBA").save(out, sizes=[(16, 16), (32, 32)])
PY

python3 -I - "$ROOT" <<'PY'
import sys, os
from PIL import Image
root = sys.argv[1]
for p in ("apple-touch-icon.png", "icon-512.png", "assets/img/og.png", "favicon.ico"):
    im = Image.open(os.path.join(root, p))
    print(p, im.size, os.path.getsize(os.path.join(root, p)), "bytes")
PY
