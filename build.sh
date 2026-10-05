#!/bin/sh
# Rebuilds index.html from src/ and stamps a new version + build time (shown at the bottom of the app).
cd "$(dirname "$0")"
V=$(( $(cat VERSION 2>/dev/null || echo 0) + 1 )); echo "$V" > VERSION
AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
{ echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#2a78d6"><style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}html,body{height:100%}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style></head><body>'
  cat src/head.html src/body.html
  echo '<script>'
  echo "const BUILD = { v: $V, at: '$AT' };"
  cat src/core.js src/store.js src/ui_shared.js src/ui_social.js src/ui_main.js
  echo '</script></body></html>'; } > index.html
echo "Built v$V at $AT"
