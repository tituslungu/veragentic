#!/usr/bin/env bash
# Verification only (not a build step): local server, URL checks, screenshots,
# size budget, contrast, form/GA behaviour test, optional Lighthouse (LIGHTHOUSE=1).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-8765}"
BASE="http://127.0.0.1:$PORT"
CHROME="${CHROME:-google-chrome}"
cd "$ROOT"

python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$ROOT" >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT
sleep 1

echo "== URLs"
for p in / /404.html /assets/css/site.css /assets/js/config.js /assets/js/main.js \
  /assets/fonts/source-serif-4.woff2 /assets/img/og.png /robots.txt /sitemap.xml \
  /favicon.ico /favicon.svg /apple-touch-icon.png /icon-512.png; do
  printf '%s %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "$BASE$p")" "$p"
done

echo "== Screenshots -> .screenshots/"
mkdir -p .screenshots
shot() { "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor="$3" \
  --window-size="$1" --screenshot=".screenshots/$2.png" "$4" >/dev/null 2>&1; }
shot 390,844 m-fold 2 "$BASE/"
shot 390,3400 m-full 1 "$BASE/"
shot 320,700 xs-fold 2 "$BASE/"
shot 1440,900 d-fold 1 "$BASE/"
shot 1440,2700 d-full 1 "$BASE/"
shot 390,844 m-404 2 "$BASE/404.html"
shot 1440,900 d-404 1 "$BASE/404.html"
ls .screenshots

echo "== Static checks"
grep -q 'style=' index.html 404.html && echo "FAIL inline style" || echo "PASS no inline style"
grep -Eq ' on[a-z]+=' index.html 404.html && echo "FAIL inline handler" || echo "PASS no inline handlers"
grep -q 'placeholder' index.html && echo "FAIL placeholder" || echo "PASS no placeholders"
[ "$(grep -o '<h1' index.html | wc -l)" = 1 ] && echo "PASS one h1" || echo "FAIL h1 count"
grep -Eiq 'terms of|privacy|cookie|consent|testimonial' index.html && echo "FAIL forbidden content" || echo "PASS no legal/cookie/testimonial content"
grep -q '© 2026 Veragentic' index.html && echo "PASS copyright" || echo "FAIL copyright"

echo "== Budget (first-load set, bytes raw / gzip)"
FILES="index.html assets/css/site.css assets/js/config.js assets/js/main.js assets/fonts/source-serif-4.woff2 favicon.svg favicon.ico"
TOTAL=0; GZ=0
for f in $FILES; do
  r=$(stat -c %s "$f"); g=$(gzip -9c "$f" | wc -c)
  printf '  %-40s %7d %7d\n' "$f" "$r" "$g"; TOTAL=$((TOTAL+r)); GZ=$((GZ+g))
done
printf '  %-40s %7d %7d\n' TOTAL "$TOTAL" "$GZ"
[ "$TOTAL" -lt 102400 ] && echo "PASS under 100 KB" || echo "FAIL over 100 KB"

echo "== Contrast (WCAG 2.x)"
python3 -I - <<'PY'
def L(h):
    c=[int(h[i:i+2],16)/255 for i in (1,3,5)]
    c=[x/12.92 if x<=0.03928 else ((x+0.055)/1.055)**2.4 for x in c]
    return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]
def cr(a,b):
    a,b=L(a),L(b); return (max(a,b)+0.05)/(min(a,b)+0.05)
P,W="#FAF8F4","#FFFFFF"
checks=[("ink",  "#14161A",4.5),("graphite","#5B5E64",4.5),("navy","#1F3A5F",4.5),("error","#9B2C2C",4.5),("field-border","#8A8C90",3.0)]
bad=0
for n,c,t in checks:
    for bn,bg in (("paper",P),("white",W)):
        r=cr(c,bg); ok=r>=t; bad+=not ok
        print(f"  {'PASS' if ok else 'FAIL'} {n} on {bn}: {r:.2f}:1 (>= {t})")
for n,c in (("ink","#14161A"),("navy","#1F3A5F")):
    r=cr(P,c); ok=r>=4.5; bad+=not ok
    print(f"  {'PASS' if ok else 'FAIL'} paper on {n}: {r:.2f}:1")
PY

echo "== Behaviour (form + GA, via Chrome DevTools Protocol)"
node "$ROOT/scripts/form-test.mjs" "$BASE/"

if [ "${LIGHTHOUSE:-0}" = 1 ]; then
  echo "== Lighthouse"
  mkdir -p .lighthouse
  npx --yes lighthouse "$BASE/" --quiet --chrome-flags="--headless=new" --output=json --output-path=.lighthouse/m.json
  npx --yes lighthouse "$BASE/" --quiet --preset=desktop --chrome-flags="--headless=new" --output=json --output-path=.lighthouse/d.json
  for f in .lighthouse/m.json .lighthouse/d.json; do
    python3 -I -c "import json,sys;d=json.load(open(sys.argv[1]));print(sys.argv[1],{k:round(v['score']*100) for k,v in d['categories'].items()})" "$f"
  done
fi
