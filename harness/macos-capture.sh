#!/bin/bash
# Research: from a macOS runner with a Docker runtime up: pipe and reach probes, then the capture arms and the kill
# check, against a Storybook served on the Mac's 127.0.0.1, through the SOCKS proxy on 127.0.0.1 as on a developer's Mac.
#   macos-capture.sh <out> <passes> <webkit passes> [extra capture.ts arguments]
set -uo pipefail
H=$(cd "$(dirname "$0")" && pwd); OUT=$(mkdir -p "$1" && cd "$1" && pwd); PASSES=$2; WK=$3; shift 3
EXTRA=("$@")
BASE=http://127.0.0.1:6400
log() { echo "### $* $(date +%T)"; }
log 'image'
t0=$(date +%s); docker pull -q --platform linux/amd64 "$IMAGE" && docker tag "$IMAGE" "$TAG"; echo "pull took $(( $(date +%s) - t0 )) s"
docker run --rm --platform linux/amd64 --entrypoint bash "$TAG" -c 'uname -m; grep -m1 "model name" /proc/cpuinfo; nproc' 2>&1
log 'pipe probe'
node "$H/pipe-probe.mjs" docker docker run -i --rm "$TAG" cat | tee -a "$OUT/pipe.txt"
log 'reach probes'
node "$H/reach-probe.mjs" default "$TAG" host.docker.internal | tee -a "$OUT/reach.txt"
node "$H/reach-probe.mjs" lima-slirp "$TAG" host.docker.internal 192.168.5.2 | tee -a "$OUT/reach.txt"
node "$H/reach-probe.mjs" host-gateway "$TAG" host.docker.internal host-gateway | tee -a "$OUT/reach.txt"
# The proxy stays on 127.0.0.1, as on a developer's Mac. Map host.docker.internal only if the runtime's own name fails.
if ! grep -q '"label":"default","url":"http://host.docker.internal:6412/".*"result":"200' "$OUT/reach.txt"; then
  grep -q '"label":"lima-slirp","url":"http://host.docker.internal:6412/".*"result":"200' "$OUT/reach.txt" && export VC_HOST_ALIAS=192.168.5.2
fi
echo "VC_HOST_ALIAS=${VC_HOST_ALIAS:-(runtime default)}"
node "$H/serve.mjs" "$GITHUB_WORKSPACE/sb/storybook" 6400 127.0.0.1 > "$OUT/serve.log" 2>&1 &
until grep -q serving "$OUT/serve.log" 2>/dev/null; do sleep 0.1; done
if [ "$WK" -gt 0 ]; then
  log 'kill checks'
  node "$H/kill-check.mjs" "$BASE" "$OUT/kill" --network proxy "${EXTRA[@]}" | tee -a "$OUT/kill.txt"
fi
log 'capture arms'
node "$H/arms.mjs" "$BASE" "$OUT/runs" "$PASSES" "chromium-live=--driver raw --network proxy ${EXTRA[*]}" "chromium-offline=--driver raw --network proxy --offline ${EXTRA[*]}" | tee -a "$OUT/runs.log"
[ "$WK" -gt 0 ] && node "$H/arms.mjs" "$BASE" "$OUT/runs" "$WK" "webkit-live=--driver pw-webkit --pw-mode attached ${EXTRA[*]}" "webkit-offline=--driver pw-webkit --pw-mode attached --offline ${EXTRA[*]}" | tee -a "$OUT/runs.log"
node "$H/dedupe.mjs" "$OUT/runs" "$OUT/snapshots"
rm -rf "$OUT"/runs/*/*/png
