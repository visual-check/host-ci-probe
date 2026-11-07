#!/bin/bash
# Research: what a macOS runner offers for Linux containers. Prints facts, never fails.
set -uo pipefail
echo "## machine"
sw_vers; uname -m; sysctl -n machdep.cpu.brand_string; echo "cpus $(sysctl -n hw.ncpu), memory $(( $(sysctl -n hw.memsize) / 1073741824 )) GiB"
echo "## virtualization"
sysctl kern.hv_support 2>&1
sysctl kern.hv_vmm_present 2>&1
sysctl -n machdep.cpu.features 2>/dev/null | tr ' ' '\n' | grep -x VMX || echo "no VMX in machdep.cpu.features"
echo "## tools"
for t in docker colima limactl lima qemu-system-x86_64 qemu-system-aarch64 podman orb orbctl; do printf '%s: ' "$t"; command -v "$t" || echo none; done
brew list --versions 2>/dev/null | grep -Ei 'docker|colima|lima|qemu|podman|orbstack' || echo "no container tools in brew list"
ls /Applications 2>/dev/null | grep -Ei 'docker|orbstack' || echo "no Docker or OrbStack app"
