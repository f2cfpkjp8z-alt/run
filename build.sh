#!/bin/sh
# Rebuilds index.html from src/ and stamps a new version + build time (shown at the bottom of the app).
cd "$(dirname "$0")"
V=$(( $(cat VERSION 2>/dev/null || echo 0) + 1 )); echo "$V" > VERSION
AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
{ echo '<!doctype html><html lang="en" data-theme="volt" data-mode="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#0b0f13"><style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}html,body{height:100%}body{margin:0;background:#0b0f13}img{max-width:100%}[hidden]{display:none!important}</style><script>try{var p=JSON.parse(localStorage.getItem("pp-ui"))||{},d=document.documentElement,t=p.theme||"volt";if(t==="auto")t=matchMedia("(prefers-color-scheme: dark)").matches?"volt":"daylight";d.dataset.theme=t;d.dataset.mode=t==="daylight"?"light":"dark";if(p.size)d.dataset.size=p.size;if(p.font)d.dataset.font=p.font}catch(e){}</script></head><body>'
  cat src/head.html src/body.html
  echo '<script>'
  echo "const BUILD = { v: $V, at: '$AT' };"
  cat src/core.js src/algo/registry.js src/algo/gap.js src/algo/vo2max.js src/algo/hrmax.js src/algo/load.js src/algo/zones.js src/algo/fitness.js src/algo/acwr.js src/algo/endurance.js src/algo/drift.js src/algo/efforts.js src/algo/race.js src/algo/efficiency.js \
    src/store.js src/ui_shared.js src/theme.js src/ui_social.js src/ai.js src/ui_algo.js src/ui_dash.js src/ui_main.js
  echo '</script></body></html>'; } > index.html
echo "Built v$V at $AT"
