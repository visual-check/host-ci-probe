#!/bin/bash
# Research: Docker Desktop on an Intel macOS runner, each step under a watchdog and with its output kept.
set -uo pipefail
t0=$(date +%s)
w() { local s=$1; shift; echo "> $* (limit ${s} s, at $(( $(date +%s) - t0 )) s)"; perl -e 'alarm shift; exec @ARGV' "$s" "$@"; echo "exit $?"; }
w 600 brew install --cask docker-desktop
ls -la /Applications | grep -i docker
w 300 sudo /Applications/Docker.app/Contents/MacOS/install --accept-license --user="$USER"
w 60 open /Applications/Docker.app
for i in $(seq 1 120); do docker info > /dev/null 2>&1 && break; sleep 5; done
echo "waited until $(( $(date +%s) - t0 )) s"
docker context ls 2>&1
docker info --format '{{.ServerVersion}} {{.OperatingSystem}} {{.NCPU}} CPUs {{.MemTotal}}' 2>&1 | head -5
pgrep -fl -i docker | head -20
ls ~/Library/Containers/com.docker.docker/Data/log/host/ 2>/dev/null
tail -60 ~/Library/Containers/com.docker.docker/Data/log/host/*.log 2>/dev/null | cut -c1-250
docker info > /dev/null 2>&1
