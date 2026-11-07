#!/bin/bash
# Research: start a Docker runtime on a macOS runner. Exits 0 once `docker info` answers.
#   macos-runtime.sh colima|colima-x86_64-tcg|docker-desktop|orbstack
set -uo pipefail
rt=$1
t0=$(date +%s)
wait_docker() { for _ in $(seq 1 "$1"); do docker info > /dev/null 2>&1 && return 0; sleep 2; done; return 1; }
case $rt in
  colima)
    brew install -q colima docker > /dev/null
    colima start --cpu 4 --memory 10 --disk 40 2>&1 | tail -20
    colima list ;;
  colima-x86_64-tcg)
    # an x86_64 VM on arm64 is full-system emulation (QEMU TCG), which needs no hypervisor
    brew install -q colima docker qemu lima-additional-guestagents > /dev/null
    colima start --arch x86_64 --vm-type qemu --cpu 3 --memory 5 --disk 40 2>&1 | tail -20
    colima list ;;
  docker-desktop)
    brew install -q --cask docker-desktop > /dev/null 2>&1 || brew install -q --cask docker > /dev/null
    sudo /Applications/Docker.app/Contents/MacOS/install --accept-license --user="$USER" 2>&1 | tail -5
    open -a Docker
    wait_docker 300 || { echo "Docker Desktop: no daemon after 600 s"; tail -30 ~/Library/Containers/com.docker.docker/Data/log/host/*.log 2>/dev/null | tail -40; } ;;
  orbstack)
    brew install -q --cask orbstack > /dev/null
    (orb start 2>&1 || /Applications/OrbStack.app/Contents/MacOS/bin/orb start 2>&1 || open -a OrbStack) | tail -5
    wait_docker 300 || echo "OrbStack: no daemon after 600 s" ;;
  *) echo "unknown runtime $rt"; exit 2 ;;
esac
echo "$rt start took $(( $(date +%s) - t0 )) s"
docker context ls 2>&1
docker info --format '{{.ServerVersion}} {{.OperatingSystem}} {{.Architecture}} {{.NCPU}} CPUs {{.MemTotal}}' 2>&1
docker info > /dev/null 2>&1
